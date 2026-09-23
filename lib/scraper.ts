import * as cheerio from "cheerio";
import type { Browser, BrowserContext, Page } from "playwright";
import { type SelectorMatch, type ScrapeOptions } from "../types/crawler";
import { sanitizeExtractedText } from "./url-utils";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let browserInstance: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let pagesScrapedCount = 0;
const MAX_PAGES_BEFORE_RECYCLE = 100;

function isVercelServerless(): boolean {
  // Only true when deployed to Vercel's cloud serverless infrastructure.
  // Local .env.local created by Vercel CLI often contains VERCEL="1", but VERCEL_REGION is only present in actual cloud runtime.
  return Boolean(process.env.VERCEL_REGION || process.env.NOW_REGION);
}

async function getBrowser(): Promise<Browser> {
  if (isVercelServerless()) {
    throw new Error("Playwright dynamic browser is not supported in Vercel Serverless environment.");
  }

  if (browserInstance && pagesScrapedCount >= MAX_PAGES_BEFORE_RECYCLE) {
    await closeBrowser();
  }

  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    })()
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
  options?: ScrapeOptions | number
): Promise<SelectorMatch | null> {
  const timeoutMs = typeof options === "number" ? options : options?.timeoutMs ?? 8000;
  const preClickSelector = typeof options === "object" ? options?.preClickSelector : undefined;

  try {
    const script = `
const { chromium } = require("playwright");
async function run() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const inputStr = Buffer.concat(chunks).toString("utf8");
  if (!inputStr) { process.stdout.write(JSON.stringify(null)); process.exit(0); }
  const { url, selectors, timeout = 8000, preClickSelector } = JSON.parse(inputStr);
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
    if (preClickSelector && typeof preClickSelector === "string" && preClickSelector.trim()) {
      try {
        const btn = await page.$(preClickSelector.trim());
        if (btn) {
          const isLink = await btn.evaluate((el) => {
            const tag = el.tagName.toLowerCase();
            const href = el.getAttribute("href");
            return tag === "a" && Boolean(href && !href.startsWith("#") && !href.startsWith("javascript:"));
          }).catch(() => false);

          const popupPromise = ctx.waitForEvent("page", { timeout: 2000 }).catch(() => null);
          const navPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => null);
          await btn.click().catch(() => null);

          const popup = await popupPromise;
          if (popup) {
            await popup.waitForLoadState("domcontentloaded").catch(() => null);
            page = popup;
          } else if (isLink) {
            await navPromise;
            await page.waitForLoadState("domcontentloaded").catch(() => null);
            await new Promise((r) => setTimeout(r, 200));
          } else {
            const navCompleted = await Promise.race([
              navPromise,
              new Promise((r) => setTimeout(r, 1200)),
            ]);
            if (!navCompleted) {
              await Promise.race([
                ...selectors.map((s) => page.waitForSelector(s, { timeout: 4000 }).catch(() => null)),
                new Promise((r) => setTimeout(r, 600)),
              ]);
            } else {
              await page.waitForLoadState("domcontentloaded").catch(() => null);
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      } catch {}
    }
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const raw = await el.textContent();
          if (raw && raw.trim()) {
            process.stdout.write(JSON.stringify({
              text: raw,
              selector: sel,
              method: "browser",
              durationMs: Date.now() - start
            }));
            await browser.close();
            process.exit(0);
          }
        }
      } catch {}
    }
    await browser.close();
    process.stdout.write(JSON.stringify(null));
    process.exit(0);
  } catch {
    if (browser) { try { await browser.close(); } catch {} }
    process.stdout.write(JSON.stringify(null));
    process.exit(0);
  }
}
run();
`;

    const payload = JSON.stringify({ url, selectors, timeout: timeoutMs, preClickSelector });
    const cpName = "child_" + "process";
    const cp = (globalThis as any).require ? (globalThis as any).require(cpName) : await import("node:child_process");

    return await new Promise((resolve) => {
      const cpEnv = { ...process.env };
      const localNodeModules = `${process.cwd()}/node_modules`;
      cpEnv.NODE_PATH = cpEnv.NODE_PATH
        ? `${localNodeModules}${process.platform === "win32" ? ";" : ":"}${cpEnv.NODE_PATH}`
        : localNodeModules;

      const child = cp.spawn("node", ["-e", script], {
        cwd: process.cwd(),
        env: cpEnv,
        stdio: ["pipe", "pipe", "ignore"],
      });

      let stdout = "";
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        resolve(null);
      }, timeoutMs + (preClickSelector ? 10000 : 4000));

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.on("close", (code: number) => {
        clearTimeout(timer);
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
              const clean = sanitizeExtractedText(parsed.text);
              if (clean) {
                return resolve({
                  ...parsed,
                  text: clean,
                } as SelectorMatch);
              }
            }
          } catch {}
        }
        resolve(null);
      });

      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  } catch {
    return null;
  }
}

/**
 * Performs dynamic scraping using a singleton Playwright Chromium browser.
 */
export async function scrapeDynamic(
  url: string,
  selectors: string[],
  options?: ScrapeOptions | number
): Promise<SelectorMatch | null> {
  const timeoutMs = typeof options === "number" ? options : options?.timeoutMs ?? 8000;
  const preClickSelector = typeof options === "object" ? options?.preClickSelector : undefined;

  if (isVercelServerless()) {
    return null;
  }

  // If running in Bun on Windows, use Node worker bridge to bypass Bun Windows pipe IPC bug
  const isBunOnWindows =
    process.platform === "win32" &&
    typeof (process as any).versions?.bun === "string";

  if (isBunOnWindows) {
    return await scrapeDynamicViaNodeWorker(url, selectors, { timeoutMs, preClickSelector });
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
      timeout: timeoutMs,
    });

    let activePage = page;
    if (preClickSelector && preClickSelector.trim()) {
      try {
        const btn = await activePage.$(preClickSelector.trim());
        if (btn) {
          const isLink = await btn.evaluate((el) => {
            const tag = el.tagName.toLowerCase();
            const href = el.getAttribute("href");
            return tag === "a" && Boolean(href && !href.startsWith("#") && !href.startsWith("javascript:"));
          }).catch(() => false);

          const popupPromise = context.waitForEvent("page", { timeout: 2000 }).catch(() => null);
          const navPromise = activePage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => null);
          await btn.click().catch(() => null);

          const popup = await popupPromise;
          if (popup) {
            await popup.waitForLoadState("domcontentloaded").catch(() => null);
            activePage = popup;
            page = popup;
          } else if (isLink) {
            await navPromise;
            await activePage.waitForLoadState("domcontentloaded").catch(() => null);
            await new Promise((r) => setTimeout(r, 200));
          } else {
            const navCompleted = await Promise.race([
              navPromise,
              new Promise((r) => setTimeout(r, 1200)),
            ]);
            if (!navCompleted) {
              await Promise.race([
                ...selectors.map((s) => activePage.waitForSelector(s, { timeout: 4000 }).catch(() => null)),
                new Promise((r) => setTimeout(r, 600)),
              ]);
            } else {
              await activePage.waitForLoadState("domcontentloaded").catch(() => null);
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      } catch {}
    }

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
  selectors: string[],
  options?: ScrapeOptions
): Promise<SelectorMatch | null> {
  if (options?.preClickSelector && options.preClickSelector.trim()) {
    return scrapeDynamic(url, selectors, options);
  }

  try {
    const staticMatch = await scrapeStatic(url, selectors);
    if (staticMatch) {
      return staticMatch;
    }
  } catch {
    // Fall back to dynamic scraping on error
  }

  return scrapeDynamic(url, selectors, options);
}

export const scrapeBrowser = scrapeDynamic;

export interface MultiFieldTarget {
  id: string;
  selectors: string[];
}

export interface MultiFieldMatch {
  text: string;
  matchedSelector: string;
}

function createEmptyMultiFieldResult(
  fields: MultiFieldTarget[]
): Record<string, MultiFieldMatch | null> {
  const result: Record<string, MultiFieldMatch | null> = {};
  for (const f of fields) {
    result[f.id] = null;
  }
  return result;
}

async function scrapeDynamicMultiViaNodeWorker(
  url: string,
  fields: MultiFieldTarget[],
  options?: ScrapeOptions | number
): Promise<Record<string, MultiFieldMatch | null>> {
  const timeoutMs = typeof options === "number" ? options : options?.timeoutMs ?? 8000;
  const preClickSelector = typeof options === "object" ? options?.preClickSelector : undefined;

  try {
    const script = `
const { chromium } = require("playwright");
async function run() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const inputStr = Buffer.concat(chunks).toString("utf8");
  if (!inputStr) { process.stdout.write(JSON.stringify({})); process.exit(0); }
  const { url, fields, timeout = 8000, preClickSelector } = JSON.parse(inputStr);
  const result = {};
  for (const f of fields) {
    result[f.id] = null;
  }
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
    if (preClickSelector && typeof preClickSelector === "string" && preClickSelector.trim()) {
      try {
        const btn = await page.$(preClickSelector.trim());
        if (btn) {
          const isLink = await btn.evaluate((el) => {
            const tag = el.tagName.toLowerCase();
            const href = el.getAttribute("href");
            return tag === "a" && Boolean(href && !href.startsWith("#") && !href.startsWith("javascript:"));
          }).catch(() => false);

          const popupPromise = ctx.waitForEvent("page", { timeout: 2000 }).catch(() => null);
          const navPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => null);
          await btn.click().catch(() => null);

          const popup = await popupPromise;
          if (popup) {
            await popup.waitForLoadState("domcontentloaded").catch(() => null);
            page = popup;
          } else if (isLink) {
            await navPromise;
            await page.waitForLoadState("domcontentloaded").catch(() => null);
            await new Promise((r) => setTimeout(r, 200));
          } else {
            const navCompleted = await Promise.race([
              navPromise,
              new Promise((r) => setTimeout(r, 1200)),
            ]);
            if (!navCompleted) {
              const allSels = fields.flatMap((f) => f.selectors || []);
              await Promise.race([
                ...allSels.map((s) => page.waitForSelector(s, { timeout: 4000 }).catch(() => null)),
                new Promise((r) => setTimeout(r, 600)),
              ]);
            } else {
              await page.waitForLoadState("domcontentloaded").catch(() => null);
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      } catch {}
    }
    for (const f of fields) {
      for (const sel of f.selectors) {
        if (!sel || !sel.trim()) continue;
        try {
          const el = await page.$(sel);
          if (el) {
            const raw = await el.textContent();
            if (raw && raw.trim()) {
              result[f.id] = { text: raw, matchedSelector: sel };
              break;
            }
          }
        } catch {}
      }
    }
    await browser.close();
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    if (browser) { try { await browser.close(); } catch {} }
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
}
run();
`;

    const payload = JSON.stringify({ url, fields, timeout: timeoutMs, preClickSelector });
    const cpName = "child_" + "process";
    const cp = (globalThis as any).require ? (globalThis as any).require(cpName) : await import("node:child_process");

    return await new Promise((resolve) => {
      const cpEnv = { ...process.env };
      const localNodeModules = `${process.cwd()}/node_modules`;
      cpEnv.NODE_PATH = cpEnv.NODE_PATH
        ? `${localNodeModules}${process.platform === "win32" ? ";" : ":"}${cpEnv.NODE_PATH}`
        : localNodeModules;

      const child = cp.spawn("node", ["-e", script], {
        cwd: process.cwd(),
        env: cpEnv,
        stdio: ["pipe", "pipe", "ignore"],
      });

      let stdout = "";
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        resolve(createEmptyMultiFieldResult(fields));
      }, timeoutMs + (preClickSelector ? 10000 : 4000));

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.on("close", (code: number) => {
        clearTimeout(timer);
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed && typeof parsed === "object") {
              const res = createEmptyMultiFieldResult(fields);
              for (const f of fields) {
                const item = parsed[f.id];
                if (item && typeof item === "object" && typeof item.text === "string") {
                  const cleaned = sanitizeExtractedText(item.text);
                  if (cleaned) {
                    res[f.id] = {
                      text: cleaned,
                      matchedSelector: String(item.matchedSelector || ""),
                    };
                  }
                }
              }
              return resolve(res);
            }
          } catch {}
        }
        resolve(createEmptyMultiFieldResult(fields));
      });

      child.on("error", () => {
        clearTimeout(timer);
        resolve(createEmptyMultiFieldResult(fields));
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  } catch {
    return createEmptyMultiFieldResult(fields);
  }
}

export async function scrapeBrowserMulti(
  url: string,
  fields: MultiFieldTarget[],
  options?: ScrapeOptions | number
): Promise<Record<string, MultiFieldMatch | null>> {
  const timeoutMs = typeof options === "number" ? options : options?.timeoutMs ?? 8000;
  const preClickSelector = typeof options === "object" ? options?.preClickSelector : undefined;

  if (isVercelServerless()) {
    return createEmptyMultiFieldResult(fields);
  }

  const isBunOnWindows =
    process.platform === "win32" &&
    typeof (process as any).versions?.bun === "string";

  if (isBunOnWindows) {
    return await scrapeDynamicMultiViaNodeWorker(url, fields, { timeoutMs, preClickSelector });
  }

  const result: Record<string, MultiFieldMatch | null> = createEmptyMultiFieldResult(fields);

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
      timeout: timeoutMs,
    });

    let activePage = page;
    if (preClickSelector && preClickSelector.trim()) {
      try {
        const btn = await activePage.$(preClickSelector.trim());
        if (btn) {
          const isLink = await btn.evaluate((el) => {
            const tag = el.tagName.toLowerCase();
            const href = el.getAttribute("href");
            return tag === "a" && Boolean(href && !href.startsWith("#") && !href.startsWith("javascript:"));
          }).catch(() => false);

          const popupPromise = context.waitForEvent("page", { timeout: 2000 }).catch(() => null);
          const navPromise = activePage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => null);
          await btn.click().catch(() => null);

          const popup = await popupPromise;
          if (popup) {
            await popup.waitForLoadState("domcontentloaded").catch(() => null);
            activePage = popup;
            page = popup;
          } else if (isLink) {
            await navPromise;
            await activePage.waitForLoadState("domcontentloaded").catch(() => null);
            await new Promise((r) => setTimeout(r, 200));
          } else {
            const navCompleted = await Promise.race([
              navPromise,
              new Promise((r) => setTimeout(r, 1200)),
            ]);
            if (!navCompleted) {
              const allSels = fields.flatMap((f) => f.selectors || []);
              await Promise.race([
                ...allSels.map((s) => activePage.waitForSelector(s, { timeout: 4000 }).catch(() => null)),
                new Promise((r) => setTimeout(r, 600)),
              ]);
            } else {
              await activePage.waitForLoadState("domcontentloaded").catch(() => null);
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      } catch {}
    }

    for (const f of fields) {
      for (const sel of f.selectors) {
        if (!sel || !sel.trim()) continue;
        try {
          const el = await activePage.$(sel);
          if (el) {
            const rawText = await el.textContent();
            if (rawText) {
              const text = sanitizeExtractedText(rawText);
              if (text) {
                result[f.id] = { text, matchedSelector: sel };
                break;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    return result;
  } catch {
    return result;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
}

/**
 * Scrapes multiple fields from a single URL fetch using static Cheerio extraction,
 * falling back to Playwright dynamic extraction for any fields not matched statically.
 */
export async function scrapeMultiField(
  url: string,
  fields: MultiFieldTarget[],
  options?: ScrapeOptions
): Promise<Record<string, MultiFieldMatch | null>> {
  const result: Record<string, MultiFieldMatch | null> = {};
  for (const f of fields) {
    result[f.id] = null;
  }

  if (!fields || fields.length === 0) {
    return result;
  }

  // If preClickSelector is configured, bypass static scraping completely
  if (options?.preClickSelector && options.preClickSelector.trim()) {
    try {
      const browserResult = await scrapeBrowserMulti(url, fields, options);
      for (const [fieldId, match] of Object.entries(browserResult)) {
        if (match) {
          result[fieldId] = match;
        }
      }
    } catch {}
    return result;
  }

  // 1. Attempt static scrape with Cheerio first
  let html = "";
  let isNotFound = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (res.status === 404 || res.status === 410) {
        isNotFound = true;
      } else if (res.ok) {
        html = await res.text();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // static fetch failed, may try browser
  }

  if (isNotFound) {
    return result;
  }

  if (html) {
    const $ = cheerio.load(html);
    for (const f of fields) {
      for (const sel of f.selectors) {
        if (!sel || !sel.trim()) continue;
        try {
          const el = $(sel).first();
          if (el.length > 0) {
            const text = sanitizeExtractedText(el.text());
            if (text.length > 0) {
              result[f.id] = { text, matchedSelector: sel };
              break;
            }
          }
        } catch {
          // ignore invalid selector syntax
        }
      }
    }
  }

  // Check if any field is still missing and we need dynamic rendering
  const missingFields = fields.filter((f) => !result[f.id]);
  if (missingFields.length === 0) {
    return result;
  }

  // 2. Playwright fallback if missing fields and page might be dynamic
  try {
    const browserResult = await scrapeBrowserMulti(url, missingFields, options);
    for (const [fieldId, match] of Object.entries(browserResult)) {
      if (match) {
        result[fieldId] = match;
      }
    }
  } catch {
    // ignore browser fallback errors, return what we have
  }

  return result;
}
