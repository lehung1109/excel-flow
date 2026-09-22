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

/**
 * Performs dynamic scraping using a singleton Playwright Chromium browser.
 */
export async function scrapeDynamic(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  const startTime = Date.now();
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
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
