import * as cheerio from "cheerio";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { type SelectorMatch } from "../types/crawler";
import { sanitizeExtractedText } from "./url-utils";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let browserInstance: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let pagesScrapedCount = 0;
const MAX_PAGES_BEFORE_RECYCLE = 100;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && pagesScrapedCount >= MAX_PAGES_BEFORE_RECYCLE) {
    await closeBrowser();
  }

  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      })
      .then((b) => {
        browserInstance = b;
        pagesScrapedCount = 0;
        browserPromise = null;
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        browserInstance = null;
        throw err;
      });
  }

  return browserPromise;
}

/**
 * Closes the singleton browser instance if running and resets references.
 */
export async function closeBrowser(): Promise<void> {
  const currentBrowser = browserInstance;
  browserInstance = null;
  browserPromise = null;
  pagesScrapedCount = 0;

  if (currentBrowser) {
    try {
      if (currentBrowser.isConnected()) {
        await currentBrowser.close();
      }
    } catch {
      // Ignore errors on close
    }
  }
}

/**
 * Performs fast static scraping using fetch and Cheerio.
 */
export async function scrapeStatic(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    for (const selector of selectors) {
      try {
        const $el = $(selector).first();
        if ($el.length > 0) {
          const rawText = $el.text();
          const text = sanitizeExtractedText(rawText);
          if (text) {
            return {
              text,
              selector,
              method: "static",
              durationMs: Date.now() - startTime,
            };
          }
        }
      } catch {
        // Invalid selector syntax; continue searching remaining selectors
        continue;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scrapeDynamicViaNodeWorker(
  url: string,
  selectors: string[],
  timeoutMs: number = 8000
): Promise<SelectorMatch | null> {
  try {
    const runner = "n" + "ode";
    const script = `
const { chromium } = require("playwright");
async function run() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const inputStr = Buffer.concat(chunks).toString("utf8");
  if (!inputStr) { process.stdout.write(JSON.stringify(null)); process.exit(0); }
  const { url, selectors, timeout = 8000 } = JSON.parse(inputStr);
  const start = Date.now();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const raw = await el.textContent();
          if (raw && raw.trim()) {
            const clean = raw
              .replace(/&nbsp;/gi, " ")
              .replace(/&quot;/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/&amp;/gi, "&")
              .replace(/[\\r\\n\\t]+/g, " ")
              .replace(/\\s{2,}/g, " ")
              .trim();
            if (clean) {
              process.stdout.write(JSON.stringify({
                text: clean,
                selector: sel,
                method: "browser",
                durationMs: Date.now() - start
              }));
              await browser.close();
              process.exit(0);
            }
          }
        }
      } catch {}
    }
    await browser.close();
    process.stdout.write(JSON.stringify(null));
  } catch {
    if (browser) { try { await browser.close(); } catch {} }
    process.stdout.write(JSON.stringify(null));
  }
}
run();
`;

    const payload = JSON.stringify({ url, selectors, timeout: timeoutMs });
    const cpName = "child_" + "process";
    const cp = (globalThis as any).require ? (globalThis as any).require(cpName) : await import("node:child_process");
    const result = cp.spawnSync("node", ["-e", script], {
      input: payload,
      encoding: "utf-8",
      timeout: timeoutMs + 5000,
    });

    if (result.status === 0 && result.stdout) {
      const parsed = JSON.parse(result.stdout.trim());
      if (parsed && typeof parsed === "object" && parsed.text) {
        return parsed as SelectorMatch;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Performs dynamic scraping using a singleton Playwright Chromium browser.
 */
export async function scrapeDynamic(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  // If running in Bun on Windows, use Node worker bridge to bypass Bun Windows pipe IPC bug
  const isBunOnWindows =
    process.platform === "win32" &&
    typeof (process as any).versions?.bun === "string";

  if (isBunOnWindows) {
    return await scrapeDynamicViaNodeWorker(url, selectors, 8000);
  }

  // In Vercel Serverless environment, local Playwright browser binaries are not installed.
  // Return null immediately rather than hanging for 10s and triggering 504 Gateway Timeout.
  if (process.env.VERCEL) {
    return null;
  }

  const startTime = Date.now();
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    let launchTimer: ReturnType<typeof setTimeout> | undefined;
    const launchTimeout = new Promise<never>((_, reject) => {
      launchTimer = setTimeout(() => reject(new Error("Browser launch timeout")), 10000);
    });

    const browser = await Promise.race([getBrowser(), launchTimeout]).finally(() => {
      if (launchTimer) clearTimeout(launchTimer);
    });

    pagesScrapedCount++;

    context = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
    });
    page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 8000,
    });

    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          const rawText = await el.textContent();
          if (rawText) {
            const text = sanitizeExtractedText(rawText);
            if (text) {
              return {
                text,
                selector,
                method: "browser",
                durationMs: Date.now() - startTime,
              };
            }
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore page close error
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore context close error
      }
    }
  }
}

/**
 * Hybrid scraping engine: Attempts fast Cheerio static scrape first,
 * falling back to Playwright dynamic scrape if static fails or has no match.
 */
export async function scrapeHybrid(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  try {
    const staticMatch = await scrapeStatic(url, selectors);
    if (staticMatch) {
      return staticMatch;
    }
  } catch {
    // Fall back to dynamic scraping on error
  }

  return scrapeDynamic(url, selectors);
}
