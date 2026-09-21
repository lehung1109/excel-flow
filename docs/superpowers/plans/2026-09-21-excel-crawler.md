# Excel Web Scraper & Enricher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-friendly web application to upload an Excel file, select a URL column, configure CSS selectors with fallback priority and presets, extract web page textContent via a hybrid scraper (Cheerio + Playwright fallback), fill the extracted text into a target column while preserving Excel formatting, stream real-time progress via Server-Sent Events, protect against memory issues on large files, and download the updated Excel file.

**Architecture:** Fullstack Next.js App Router (React 19, TypeScript, Tailwind CSS v4) with an in-memory/temp-storage layer. The scraping pipeline uses a concurrency-limited hybrid engine (fast static HTTP fetch + Cheerio, fallback to Playwright Chromium singleton). Real-time progress is streamed using Server-Sent Events (SSE), and Excel manipulation is handled by `exceljs`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Bun, `exceljs`, `cheerio`, `playwright`, `p-limit`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-09-21-excel-crawler-design.md`

## Global Constraints

- Platform: Node.js / Bun runtime on Next.js 16 App Router.
- Styling: Tailwind CSS v4 with clean, modern, accessible design.
- Excel compatibility: Support `.xlsx` and `.xls` input; output valid `.xlsx` preserving styles, fonts, borders, and column widths.
- Scraping strategy: Static fetch + Cheerio first (<0.5s); Playwright headless browser fallback only if selector not found.
- Safeguards: Strict concurrency limit (3-5 concurrent workers), virtual/capped log rendering (max 100 recent rows), row range selection, and AbortSignal support.
- File retention: Temporary modified files expire and are deleted after 1 hour (TTL).

---

### Task 1: Project Dependencies & Shared Types Definition

**Files:**
- Modify: `package.json`
- Create: `types/crawler.ts`
- Test: `types/__tests__/types.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `SelectorMatch`: `{ text: string; selector: string; method: 'static' | 'browser' }`
  - `CrawlRowResult`: `{ rowIndex: number; url: string; status: 'success' | 'failed' | 'skipped'; matchedSelector?: string; text?: string; error?: string }`
  - `CrawlProgressEvent`: Union of SSE events (`start`, `row_progress`, `complete`, `error`)
  - `TargetColumnConfig`: `{ mode: 'existing'; colIndex: number } | { mode: 'new'; colName: string }`
  - `ExcelSheetSummary`: `{ name: string; rowCount: number; columns: { index: number; header: string }[]; sampleRows: (string | number | null)[][] }`

- [ ] **Step 1: Install required packages**

Run: `bun add exceljs cheerio playwright p-limit lucide-react`
Run: `bun add -d @types/p-limit`

- [ ] **Step 2: Write failing test for type contract validation**

```typescript
// types/__tests__/types.test.ts
import { describe, expect, it } from "bun:test";
import type {
  CrawlProgressEvent,
  CrawlRowResult,
  ExcelSheetSummary,
  SelectorMatch,
  TargetColumnConfig,
} from "../crawler";

describe("Crawler Types", () => {
  it("validates SelectorMatch shape", () => {
    const match: SelectorMatch = {
      text: "Sample Title",
      selector: "h1",
      method: "static",
    };
    expect(match.text).toBe("Sample Title");
    expect(match.selector).toBe("h1");
    expect(match.method).toBe("static");
  });

  it("validates TargetColumnConfig union", () => {
    const existingCol: TargetColumnConfig = { mode: "existing", colIndex: 2 };
    const newCol: TargetColumnConfig = { mode: "new", colName: "Title_Extracted" };
    expect(existingCol.mode).toBe("existing");
    expect(newCol.mode).toBe("new");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test types/__tests__/types.test.ts`
Expected: FAIL with "Cannot find module '../crawler'"

- [ ] **Step 4: Implement `types/crawler.ts`**

```typescript
// types/crawler.ts
export type ScrapeMethod = "static" | "browser";

export interface SelectorMatch {
  text: string;
  selector: string;
  method: ScrapeMethod;
  durationMs?: number;
}

export type CrawlStatus = "success" | "failed" | "skipped";

export interface CrawlRowResult {
  rowIndex: number;
  url: string;
  status: CrawlStatus;
  matchedSelector?: string;
  text?: string;
  error?: string;
}

export type TargetColumnConfig =
  | { mode: "existing"; colIndex: number }
  | { mode: "new"; colName: string };

export interface ExcelColumnInfo {
  index: number; // 1-indexed
  header: string;
}

export interface ExcelSheetSummary {
  name: string;
  rowCount: number;
  columns: ExcelColumnInfo[];
  sampleRows: (string | number | null)[][];
}

export interface CrawlJobSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export type CrawlProgressEvent =
  | { type: "start"; totalRows: number }
  | {
      type: "row_progress";
      rowIndex: number;
      url: string;
      status: CrawlStatus;
      matchedSelector?: string;
      text?: string;
      error?: string;
      progressPercent: number;
      processedCount: number;
      totalCount: number;
      etaSeconds: number;
    }
  | {
      type: "complete";
      success: boolean;
      downloadId: string;
      summary: CrawlJobSummary;
    }
  | { type: "error"; message: string };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test types/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock types/
git commit -m "feat: add dependencies and core crawler types"
```

---

### Task 2: URL & Text Sanitization Utilities

**Files:**
- Create: `lib/url-utils.ts`
- Test: `lib/__tests__/url-utils.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `normalizeUrl(raw: unknown): string | null`
  - `sanitizeExtractedText(raw: string): string`
  - `calculateETA(startTime: number, processed: number, total: number): number`

- [ ] **Step 1: Write failing tests for URL normalization and text sanitization**

```typescript
// lib/__tests__/url-utils.test.ts
import { describe, expect, it } from "bun:test";
import { calculateETA, normalizeUrl, sanitizeExtractedText } from "../url-utils";

describe("url-utils", () => {
  describe("normalizeUrl", () => {
    it("returns null for empty or non-string input", () => {
      expect(normalizeUrl("")).toBeNull();
      expect(normalizeUrl(null)).toBeNull();
      expect(normalizeUrl(undefined)).toBeNull();
      expect(normalizeUrl(12345)).toBeNull();
    });

    it("keeps valid http/https URLs as-is", () => {
      expect(normalizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
      expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    });

    it("prepends https:// if protocol is omitted", () => {
      expect(normalizeUrl("example.com/products/item-1")).toBe("https://example.com/products/item-1");
      expect(normalizeUrl("www.google.com")).toBe("https://www.google.com");
    });

    it("returns null for invalid strings that cannot be valid URLs", () => {
      expect(normalizeUrl("not an url at all")).toBeNull();
      expect(normalizeUrl("   ")).toBeNull();
    });
  });

  describe("sanitizeExtractedText", () => {
    it("trims excess whitespace and unescapes common entities", () => {
      const input = "   Hello &nbsp; World &amp; Friends   \n\n\n  Good  day!  ";
      const result = sanitizeExtractedText(input);
      expect(result).toBe("Hello World & Friends Good day!");
    });

    it("handles empty or whitespace-only strings", () => {
      expect(sanitizeExtractedText("")).toBe("");
      expect(sanitizeExtractedText("   \n\t  ")).toBe("");
    });
  });

  describe("calculateETA", () => {
    it("calculates remaining seconds based on elapsed time and progress", () => {
      const now = Date.now();
      const startTime = now - 10000; // 10s elapsed
      // 10 done out of 100 in 10s -> 1s per item -> 90 items left -> 90s
      const eta = calculateETA(startTime, 10, 100);
      expect(eta).toBeGreaterThanOrEqual(88);
      expect(eta).toBeLessThanOrEqual(92);
    });

    it("returns 0 if processed equals total or processed is 0", () => {
      const now = Date.now();
      expect(calculateETA(now, 0, 100)).toBe(0);
      expect(calculateETA(now - 5000, 100, 100)).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/url-utils.test.ts`
Expected: FAIL with "Cannot find module '../url-utils'"

- [ ] **Step 3: Implement `lib/url-utils.ts`**

```typescript
// lib/url-utils.ts

/**
 * Normalizes input value to a valid URL string or returns null if invalid.
 */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // If missing protocol, prepend https://
  if (!/^https?:\/\//i.test(trimmed)) {
    // Check if it looks like a domain / path
    if (/^[\w-]+(\.[\w-]+)+[/#?]?/i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Cleans up raw extracted textContent by stripping weird HTML entities,
 * normalizing redundant spaces and newlines, and trimming ends.
 */
export function sanitizeExtractedText(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

/**
 * Calculates estimated time remaining in seconds.
 */
export function calculateETA(startTime: number, processed: number, total: number): number {
  if (processed <= 0 || processed >= total) return 0;
  const elapsedMs = Date.now() - startTime;
  const msPerItem = elapsedMs / processed;
  const remainingItems = total - processed;
  return Math.max(0, Math.round((msPerItem * remainingItems) / 1000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/__tests__/url-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/url-utils.ts lib/__tests__/url-utils.test.ts
git commit -m "feat: add URL normalization, text sanitization and ETA utilities"
```

---

### Task 3: Excel Inspection & Enrichment Service (`exceljs`)

**Files:**
- Create: `lib/excel-service.ts`
- Test: `lib/__tests__/excel-service.test.ts`

**Interfaces:**
- Consumes:
  - `ExcelSheetSummary`, `TargetColumnConfig` from `types/crawler.ts`
- Produces:
  - `inspectExcelBuffer(buffer: Buffer): Promise<ExcelSheetSummary[]>`
  - `enrichExcelBuffer(options: EnrichExcelOptions): Promise<Buffer>`

- [ ] **Step 1: Write failing tests for Excel inspection and enrichment**

```typescript
// lib/__tests__/excel-service.test.ts
import { describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import { enrichExcelBuffer, inspectExcelBuffer } from "../excel-service";

async function createSampleExcel(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow(["ID", "Name", "URL", "Price"]);
  sheet.addRow([1, "Item 1", "https://example.com/1", 100]);
  sheet.addRow([2, "Item 2", "https://example.com/2", 200]);
  const uint8 = await workbook.xlsx.writeBuffer();
  return Buffer.from(uint8);
}

describe("excel-service", () => {
  it("inspectExcelBuffer returns correct sheets, headers, and sample rows", async () => {
    const buffer = await createSampleExcel();
    const summaries = await inspectExcelBuffer(buffer);

    expect(summaries.length).toBe(1);
    expect(summaries[0].name).toBe("Products");
    expect(summaries[0].columns.map((c) => c.header)).toEqual(["ID", "Name", "URL", "Price"]);
    expect(summaries[0].sampleRows.length).toBe(2);
    expect(summaries[0].sampleRows[0][1]).toBe("Item 1");
  });

  it("enrichExcelBuffer adds a new column and preserves existing rows", async () => {
    const buffer = await createSampleExcel();
    const enrichedBuffer = await enrichExcelBuffer({
      buffer,
      sheetName: "Products",
      targetColumn: { mode: "new", colName: "Extracted_Title" },
      rowResults: new Map([
        [2, "Extracted Title 1"],
        [3, "Extracted Title 2"],
      ]),
    });

    const readWorkbook = new ExcelJS.Workbook();
    await readWorkbook.xlsx.load(enrichedBuffer);
    const sheet = readWorkbook.getWorksheet("Products");
    expect(sheet).toBeDefined();

    // Check header of 5th column
    const headerRow = sheet!.getRow(1);
    expect(headerRow.getCell(5).value).toBe("Extracted_Title");

    // Check row values
    expect(sheet!.getRow(2).getCell(5).value).toBe("Extracted Title 1");
    expect(sheet!.getRow(3).getCell(5).value).toBe("Extracted Title 2");
    // Check existing values remained intact
    expect(sheet!.getRow(2).getCell(2).value).toBe("Item 1");
  });

  it("enrichExcelBuffer updates an existing column", async () => {
    const buffer = await createSampleExcel();
    const enrichedBuffer = await enrichExcelBuffer({
      buffer,
      sheetName: "Products",
      targetColumn: { mode: "existing", colIndex: 4 }, // Price column
      rowResults: new Map([[2, "$99"]]),
    });

    const readWorkbook = new ExcelJS.Workbook();
    await readWorkbook.xlsx.load(enrichedBuffer);
    const sheet = readWorkbook.getWorksheet("Products");
    expect(sheet!.getRow(2).getCell(4).value).toBe("$99");
    expect(sheet!.getRow(3).getCell(4).value).toBe(200); // untouched row
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/excel-service.test.ts`
Expected: FAIL with "Cannot find module '../excel-service'"

- [ ] **Step 3: Implement `lib/excel-service.ts`**

```typescript
// lib/excel-service.ts
import ExcelJS from "exceljs";
import type { ExcelColumnInfo, ExcelSheetSummary, TargetColumnConfig } from "../types/crawler";

export async function inspectExcelBuffer(buffer: Buffer): Promise<ExcelSheetSummary[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const summaries: ExcelSheetSummary[] = [];

  workbook.eachSheet((worksheet) => {
    const columns: ExcelColumnInfo[] = [];
    const headerRow = worksheet.getRow(1);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      columns.push({
        index: colNumber,
        header: cell.text?.toString() || `Column ${colNumber}`,
      });
    });

    const sampleRows: (string | number | null)[][] = [];
    const maxSample = Math.min(worksheet.rowCount, 6);

    for (let r = 2; r <= maxSample; r++) {
      const row = worksheet.getRow(r);
      const rowValues: (string | number | null)[] = [];
      for (const col of columns) {
        const val = row.getCell(col.index).value;
        if (val === null || val === undefined) {
          rowValues.push(null);
        } else if (typeof val === "object" && "text" in val) {
          rowValues.push((val as { text: string }).text);
        } else {
          rowValues.push(String(val));
        }
      }
      sampleRows.push(rowValues);
    }

    summaries.push({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columns,
      sampleRows,
    });
  });

  return summaries;
}

export interface EnrichExcelOptions {
  buffer: Buffer;
  sheetName: string;
  targetColumn: TargetColumnConfig;
  rowResults: Map<number, string>; // rowIndex (1-indexed) -> extracted text
}

export async function enrichExcelBuffer(options: EnrichExcelOptions): Promise<Buffer> {
  const { buffer, sheetName, targetColumn, rowResults } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Worksheet '${sheetName}' not found in Excel workbook.`);
  }

  let targetColIndex: number;

  if (targetColumn.mode === "existing") {
    targetColIndex = targetColumn.colIndex;
  } else {
    // Find the next available column index after current max column
    const headerRow = worksheet.getRow(1);
    let maxCol = 1;
    headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber > maxCol) maxCol = colNumber;
    });
    targetColIndex = maxCol + 1;

    // Set header cell for new column
    const targetCell = headerRow.getCell(targetColIndex);
    targetCell.value = targetColumn.colName;
    targetCell.font = { bold: true };
  }

  // Write row results
  for (const [rowIndex, text] of rowResults.entries()) {
    const row = worksheet.getRow(rowIndex);
    const cell = row.getCell(targetColIndex);
    cell.value = text;
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outputBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/__tests__/excel-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/excel-service.ts lib/__tests__/excel-service.test.ts
git commit -m "feat: implement excel inspection and enrichment service"
```

---

### Task 4: Hybrid Scraping Engine (Cheerio + Playwright Singleton)

**Files:**
- Create: `lib/scraper.ts`
- Test: `lib/__tests__/scraper.test.ts`

**Interfaces:**
- Consumes:
  - `SelectorMatch` from `types/crawler.ts`
  - `sanitizeExtractedText` from `lib/url-utils.ts`
- Produces:
  - `scrapeStatic(url: string, selectors: string[]): Promise<SelectorMatch | null>`
  - `scrapeDynamic(url: string, selectors: string[]): Promise<SelectorMatch | null>`
  - `scrapeHybrid(url: string, selectors: string[]): Promise<SelectorMatch | null>`
  - `closeBrowser(): Promise<void>`

- [ ] **Step 1: Write failing tests for scraper functions with mock HTTP**

```typescript
// lib/__tests__/scraper.test.ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { closeBrowser, scrapeHybrid, scrapeStatic } from "../scraper";

describe("scraper", () => {
  let server: any;
  let testUrl: string;

  beforeAll(() => {
    // Start a lightweight local test HTTP server using Bun.serve
    server = Bun.serve({
      port: 3099,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/static") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <body>
                <h1 class="main-title">   Product Title From Test   </h1>
                <div class="desc">Some description</div>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    testUrl = `http://localhost:3099/static`;
  });

  afterAll(async () => {
    server.stop();
    await closeBrowser();
  });

  it("scrapeStatic finds first matching selector and sanitizes text", async () => {
    const match = await scrapeStatic(testUrl, [
      ".non-existent",
      "h1.main-title",
      ".desc",
    ]);
    expect(match).not.toBeNull();
    expect(match?.selector).toBe("h1.main-title");
    expect(match?.text).toBe("Product Title From Test");
    expect(match?.method).toBe("static");
  });

  it("scrapeStatic returns null when no selector matches", async () => {
    const match = await scrapeStatic(testUrl, [".unknown-1", "#missing-2"]);
    expect(match).toBeNull();
  });

  it("scrapeHybrid falls back gracefully and matches static page", async () => {
    const match = await scrapeHybrid(testUrl, ["h1.main-title"]);
    expect(match).not.toBeNull();
    expect(match?.text).toBe("Product Title From Test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/scraper.test.ts`
Expected: FAIL with "Cannot find module '../scraper'"

- [ ] **Step 3: Implement `lib/scraper.ts`**

```typescript
// lib/scraper.ts
import * as cheerio from "cheerio";
import { chromium, type Browser } from "playwright";
import type { SelectorMatch } from "../types/crawler";
import { sanitizeExtractedText } from "./url-utils";

let browserInstance: Browser | null = null;
let pagesScrapedCount = 0;
const MAX_PAGES_BEFORE_RESTART = 100;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && pagesScrapedCount >= MAX_PAGES_BEFORE_RESTART) {
    try {
      await browserInstance.close();
    } catch {
      // ignore error
    }
    browserInstance = null;
    pagesScrapedCount = 0;
  }

  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    pagesScrapedCount = 0;
  }

  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // ignore error
    }
    browserInstance = null;
    pagesScrapedCount = 0;
  }
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
};

/**
 * Rapidly fetches static HTML and searches DOM selectors using Cheerio.
 */
export async function scrapeStatic(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    for (const selector of selectors) {
      const trimmed = selector.trim();
      if (!trimmed) continue;

      try {
        const el = $(trimmed);
        if (el.length > 0) {
          const rawText = el.first().text();
          const cleanText = sanitizeExtractedText(rawText);
          if (cleanText) {
            return {
              text: cleanText,
              selector: trimmed,
              method: "static",
              durationMs: Date.now() - startTime,
            };
          }
        }
      } catch {
        // invalid selector syntax, continue to next
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Opens a headless browser page to evaluate selectors on client-rendered pages.
 */
export async function scrapeDynamic(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  const startTime = Date.now();
  let browser: Browser | null = null;
  let page: any = null;

  try {
    browser = await getBrowser();
    pagesScrapedCount++;

    const context = await browser.newContext({
      userAgent: DEFAULT_HEADERS["User-Agent"],
    });
    page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 8000,
    });

    for (const selector of selectors) {
      const trimmed = selector.trim();
      if (!trimmed) continue;

      try {
        const el = await page.$(trimmed);
        if (el) {
          const rawText = await el.textContent();
          if (rawText) {
            const cleanText = sanitizeExtractedText(rawText);
            if (cleanText) {
              await context.close();
              return {
                text: cleanText,
                selector: trimmed,
                method: "browser",
                durationMs: Date.now() - startTime,
              };
            }
          }
        }
      } catch {
        // invalid selector syntax
      }
    }

    await context.close();
    return null;
  } catch {
    if (page) {
      try {
        await page.close();
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/**
 * Hybrid scraper: tests static fetch first, falls back to dynamic browser.
 */
export async function scrapeHybrid(
  url: string,
  selectors: string[]
): Promise<SelectorMatch | null> {
  const staticResult = await scrapeStatic(url, selectors);
  if (staticResult) {
    return staticResult;
  }

  // Fallback to dynamic Playwright
  return await scrapeDynamic(url, selectors);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/__tests__/scraper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scraper.ts lib/__tests__/scraper.test.ts
git commit -m "feat: implement hybrid scraper with Cheerio and Playwright fallback"
```

---

### Task 5: Temp Storage & File Download Endpoint

**Files:**
- Create: `lib/temp-store.ts`
- Create: `app/api/download/[id]/route.ts`
- Test: `lib/__tests__/temp-store.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `saveTempFile(buffer: Buffer, filename: string): string` (returns `downloadId`)
  - `getTempFile(downloadId: string): { buffer: Buffer; filename: string } | null`
  - `GET /api/download/[id]` route handler

- [ ] **Step 1: Write failing tests for temp storage TTL and retrieval**

```typescript
// lib/__tests__/temp-store.test.ts
import { describe, expect, it } from "bun:test";
import { getTempFile, saveTempFile } from "../temp-store";

describe("temp-store", () => {
  it("saves and retrieves file buffer and original filename", () => {
    const testBuf = Buffer.from("Excel file data test");
    const downloadId = saveTempFile(testBuf, "output.xlsx");

    expect(typeof downloadId).toBe("string");
    expect(downloadId.length).toBeGreaterThan(5);

    const retrieved = getTempFile(downloadId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.filename).toBe("output.xlsx");
    expect(retrieved?.buffer.toString()).toBe("Excel file data test");
  });

  it("returns null for non-existent or expired id", () => {
    expect(getTempFile("invalid-id-999")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/temp-store.test.ts`
Expected: FAIL with "Cannot find module '../temp-store'"

- [ ] **Step 3: Implement `lib/temp-store.ts`**

```typescript
// lib/temp-store.ts
import crypto from "crypto";

interface TempStoredFile {
  buffer: Buffer;
  filename: string;
  createdAt: number;
}

const fileMap = new Map<string, TempStoredFile>();
const ONE_HOUR_MS = 60 * 60 * 1000;

// Periodic cleanup of files older than 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [id, file] of fileMap.entries()) {
    if (now - file.createdAt > ONE_HOUR_MS) {
      fileMap.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function saveTempFile(buffer: Buffer, filename: string): string {
  const id = crypto.randomUUID();
  fileMap.set(id, {
    buffer,
    filename,
    createdAt: Date.now(),
  });
  return id;
}

export function getTempFile(id: string): { buffer: Buffer; filename: string } | null {
  const file = fileMap.get(id);
  if (!file) return null;
  if (Date.now() - file.createdAt > ONE_HOUR_MS) {
    fileMap.delete(id);
    return null;
  }
  return { buffer: file.buffer, filename: file.filename };
}
```

- [ ] **Step 4: Implement `app/api/download/[id]/route.ts`**

```typescript
// app/api/download/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTempFile } from "@/lib/temp-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = getTempFile(id);

  if (!file) {
    return new NextResponse("File not found or expired. Please re-run the crawl.", {
      status: 404,
    });
  }

  const encodedFilename = encodeURIComponent(file.filename);

  return new NextResponse(file.buffer as any, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename}"; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": file.buffer.length.toString(),
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/__tests__/temp-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/temp-store.ts lib/__tests__/temp-store.test.ts app/api/download/
git commit -m "feat: implement temporary storage with TTL and download API route"
```

---

### Task 6: Test Selector API (`POST /api/test-selector`)

**Files:**
- Create: `app/api/test-selector/route.ts`
- Test: `app/api/test-selector/__tests__/route.test.ts`

**Interfaces:**
- Consumes:
  - `normalizeUrl` from `lib/url-utils.ts`
  - `scrapeHybrid` from `lib/scraper.ts`
- Produces:
  - `POST /api/test-selector`: `{ success: boolean, matchedSelector?: string, textContent?: string, method?: string, durationMs?: number, error?: string }`

- [ ] **Step 1: Write failing integration test for test-selector API**

```typescript
// app/api/test-selector/__tests__/route.test.ts
import { describe, expect, it } from "bun:test";
import { POST } from "../route";
import { NextRequest } from "next/server";

describe("POST /api/test-selector", () => {
  it("returns error for invalid URL", async () => {
    const req = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-valid-url", selectors: ["h1"] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("URL");
  });

  it("returns error if selectors array is empty", async () => {
    const req = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com", selectors: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/test-selector/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'"

- [ ] **Step 3: Implement `app/api/test-selector/route.ts`**

```typescript
// app/api/test-selector/route.ts
import { NextRequest, NextResponse } from "next/server";
import { scrapeHybrid } from "@/lib/scraper";
import { normalizeUrl } from "@/lib/url-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url: rawUrl, selectors } = body;

    if (!Array.isArray(selectors) || selectors.length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập ít nhất 1 CSS Selector." },
        { status: 400 }
      );
    }

    const validUrl = normalizeUrl(rawUrl);
    if (!validUrl) {
      return NextResponse.json(
        { success: false, error: "URL không hợp lệ hoặc bị trống." },
        { status: 400 }
      );
    }

    const match = await scrapeHybrid(validUrl, selectors);

    if (!match) {
      return NextResponse.json({
        success: false,
        error: "Không tìm thấy nội dung nào khớp với danh sách selector trên trang web này.",
      });
    }

    return NextResponse.json({
      success: true,
      matchedSelector: match.selector,
      textContent: match.text,
      method: match.method,
      durationMs: match.durationMs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi server khi kiểm tra selector." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/test-selector/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/test-selector/
git commit -m "feat: implement test-selector API endpoint"
```

---

### Task 7: SSE Streaming Crawl API (`POST /api/crawl`)

**Files:**
- Create: `app/api/crawl/route.ts`
- Test: `app/api/crawl/__tests__/route.test.ts`

**Interfaces:**
- Consumes:
  - `enrichExcelBuffer` from `lib/excel-service.ts`
  - `scrapeHybrid` from `lib/scraper.ts`
  - `normalizeUrl`, `calculateETA` from `lib/url-utils.ts`
  - `saveTempFile` from `lib/temp-store.ts`
- Produces:
  - `POST /api/crawl`: Streaming Response (`text/event-stream`)

- [ ] **Step 1: Write test for crawl request validation**

```typescript
// app/api/crawl/__tests__/route.test.ts
import { describe, expect, it } from "bun:test";
import { POST } from "../route";
import { NextRequest } from "next/server";

describe("POST /api/crawl", () => {
  it("rejects request without file", async () => {
    const formData = new FormData();
    formData.append("sheetName", "Sheet1");

    const req = new NextRequest("http://localhost:3000/api/crawl", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/crawl/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'"

- [ ] **Step 3: Implement `app/api/crawl/route.ts` with Server-Sent Events**

```typescript
// app/api/crawl/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import pLimit from "p-limit";
import { enrichExcelBuffer } from "@/lib/excel-service";
import { scrapeHybrid } from "@/lib/scraper";
import { saveTempFile } from "@/lib/temp-store";
import { calculateETA, normalizeUrl } from "@/lib/url-utils";
import type { TargetColumnConfig } from "@/types/crawler";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const sheetName = (formData.get("sheetName") as string) || "Sheet1";
  const urlColIndex = parseInt(formData.get("urlColIndex") as string, 10);
  const targetColJson = formData.get("targetColumnConfig") as string;
  const selectorsJson = formData.get("selectors") as string;
  const rowRangeJson = formData.get("rowRange") as string | null;

  if (!file || isNaN(urlColIndex) || !targetColJson || !selectorsJson) {
    return new NextResponse("Thiếu thông tin bắt buộc (file, cột URL, cột đích, selector).", {
      status: 400,
    });
  }

  let targetColumnConfig: TargetColumnConfig;
  let selectors: string[];
  let rowRange: { startRow?: number; endRow?: number } = {};

  try {
    targetColumnConfig = JSON.parse(targetColJson);
    selectors = JSON.parse(selectorsJson);
    if (rowRangeJson) {
      rowRange = JSON.parse(rowRangeJson);
    }
  } catch {
    return new NextResponse("Dữ liệu JSON không hợp lệ.", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);

  // Read the sheet to identify targets
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(originalBuffer);
  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];

  if (!worksheet) {
    return new NextResponse(`Sheet '${sheetName}' không tồn tại trong file.`, { status: 400 });
  }

  const startRow = Math.max(2, rowRange.startRow || 2);
  const endRow = Math.min(worksheet.rowCount, rowRange.endRow || worksheet.rowCount);

  interface RowTask {
    rowIndex: number;
    rawUrlValue: unknown;
  }

  const tasks: RowTask[] = [];
  for (let r = startRow; r <= endRow; r++) {
    const cellValue = worksheet.getRow(r).getCell(urlColIndex).value;
    let urlVal: unknown = cellValue;
    if (cellValue && typeof cellValue === "object" && "text" in cellValue) {
      urlVal = (cellValue as any).text;
    }
    tasks.push({ rowIndex: r, rawUrlValue: urlVal });
  }

  const totalRows = tasks.length;
  const encoder = new TextEncoder();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(name: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      sendEvent("start", { totalRows });

      const startTime = Date.now();
      let processedCount = 0;
      let succeededCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      const rowResults = new Map<number, string>();
      const limit = pLimit(3); // Concurrency limit of 3 workers

      try {
        const promises = tasks.map((task) =>
          limit(async () => {
            const validUrl = normalizeUrl(task.rawUrlValue);

            if (!validUrl) {
              skippedCount++;
              processedCount++;
              const percent = Math.round((processedCount / totalRows) * 100);
              const eta = calculateETA(startTime, processedCount, totalRows);
              sendEvent("row_progress", {
                rowIndex: task.rowIndex,
                url: String(task.rawUrlValue || ""),
                status: "skipped",
                error: "URL trống hoặc không hợp lệ",
                progressPercent: percent,
                processedCount,
                totalCount: totalRows,
                etaSeconds: eta,
              });
              return;
            }

            try {
              const match = await scrapeHybrid(validUrl, selectors);
              processedCount++;
              const percent = Math.round((processedCount / totalRows) * 100);
              const eta = calculateETA(startTime, processedCount, totalRows);

              if (match && match.text) {
                succeededCount++;
                rowResults.set(task.rowIndex, match.text);
                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: validUrl,
                  status: "success",
                  matchedSelector: match.selector,
                  text: match.text,
                  progressPercent: percent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds: eta,
                });
              } else {
                failedCount++;
                sendEvent("row_progress", {
                  rowIndex: task.rowIndex,
                  url: validUrl,
                  status: "failed",
                  error: "Không tìm thấy selector nào khớp",
                  progressPercent: percent,
                  processedCount,
                  totalCount: totalRows,
                  etaSeconds: eta,
                });
              }
            } catch (crawlErr: any) {
              processedCount++;
              failedCount++;
              const percent = Math.round((processedCount / totalRows) * 100);
              const eta = calculateETA(startTime, processedCount, totalRows);
              sendEvent("row_progress", {
                rowIndex: task.rowIndex,
                url: validUrl,
                status: "failed",
                error: crawlErr?.message || "Lỗi cào dữ liệu",
                progressPercent: percent,
                processedCount,
                totalCount: totalRows,
                etaSeconds: eta,
              });
            }
          })
        );

        await Promise.all(promises);

        // Generate updated Excel file
        const enrichedBuffer = await enrichExcelBuffer({
          buffer: originalBuffer,
          sheetName,
          targetColumn: targetColumnConfig,
          rowResults,
        });

        const originalName = file.name.replace(/\.[^/.]+$/, "");
        const outputFilename = `${originalName}_updated.xlsx`;
        const downloadId = saveTempFile(enrichedBuffer, outputFilename);

        sendEvent("complete", {
          success: true,
          downloadId,
          summary: {
            total: totalRows,
            succeeded: succeededCount,
            failed: failedCount,
            skipped: skippedCount,
            durationMs: Date.now() - startTime,
          },
        });
      } catch (err: any) {
        sendEvent("error", { message: err?.message || "Lỗi hệ thống khi xử lý cào dữ liệu." });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/crawl/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/crawl/
git commit -m "feat: implement SSE streaming crawl API endpoint"
```

---

### Task 8: UI Components - File Upload & Selector Configurator

**Files:**
- Create: `components/FileUploadZone.tsx`
- Create: `components/SelectorConfig.tsx`
- Test: Verify build / typecheck via `bun run build`

**Interfaces:**
- Consumes:
  - `ExcelSheetSummary`, `TargetColumnConfig` from `types/crawler.ts`
  - `inspectExcelBuffer` from `lib/excel-service.ts`
- Produces:
  - `FileUploadZone`: Handles drag-drop, parses sheets and column headers, renders preview table.
  - `SelectorConfig`: Renders presets selector library, dynamic tag/input list (add, edit, remove), target column configuration, and row range.

- [ ] **Step 1: Implement `components/FileUploadZone.tsx`**

```tsx
// components/FileUploadZone.tsx
"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import type { ExcelSheetSummary } from "@/types/crawler";

interface FileUploadZoneProps {
  onFileLoaded: (file: File, summaries: ExcelSheetSummary[]) => void;
  selectedSheet: string;
  onSheetChange: (sheetName: string) => void;
}

export default function FileUploadZone({
  onFileLoaded,
  selectedSheet,
  onSheetChange,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ExcelSheetSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Vui lòng tải lên file định dạng Excel (.xlsx hoặc .xls)");
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setError("File quá lớn (> 30MB). Vui lòng tải file dung lượng nhỏ hơn.");
      return;
    }

    setError(null);
    setLoading(true);
    setFileName(file.name);
    setFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");

    try {
      // Dynamic import exceljs on client for quick client-side preview
      const ExcelJS = (await import("exceljs")).default;
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const summaries: ExcelSheetSummary[] = [];
      workbook.eachSheet((worksheet) => {
        const columns: { index: number; header: string }[] = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          columns.push({
            index: colNumber,
            header: cell.text?.toString() || `Cột ${colNumber}`,
          });
        });

        const sampleRows: (string | number | null)[][] = [];
        const maxSample = Math.min(worksheet.rowCount, 6);
        for (let r = 2; r <= maxSample; r++) {
          const row = worksheet.getRow(r);
          const rowValues: (string | number | null)[] = [];
          for (const col of columns) {
            const val = row.getCell(col.index).value;
            if (val === null || val === undefined) {
              rowValues.push(null);
            } else if (typeof val === "object" && "text" in val) {
              rowValues.push((val as { text: string }).text);
            } else {
              rowValues.push(String(val));
            }
          }
          sampleRows.push(rowValues);
        }

        summaries.push({
          name: worksheet.name,
          rowCount: worksheet.rowCount,
          columns,
          sampleRows,
        });
      });

      setSheets(summaries);
      if (summaries.length > 0) {
        onSheetChange(summaries[0].name);
      }
      onFileLoaded(file, summaries);
    } catch (err: any) {
      setError("Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file.");
    } finally {
      setLoading(false);
    }
  }

  const activeSheet = sheets.find((s) => s.name === selectedSheet) || sheets[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
        Bước 1: Tải lên file Excel
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50"
            : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div>
            <p className="font-medium text-slate-700">
              Kéo thả file Excel vào đây hoặc <span className="text-emerald-600 underline">bấm để chọn</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng .xlsx, .xls (Tối đa 30MB)</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-4 p-4 text-center text-sm text-slate-600">
          Đang đọc và phân tích cấu trúc file Excel...
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {fileName && !loading && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>{fileName}</span>
              <span className="text-xs text-slate-400">({fileSize})</span>
            </div>

            {sheets.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Sheet:</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => onSheetChange(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} dòng)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeSheet && activeSheet.columns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Xem trước 5 dòng đầu ({activeSheet.columns.length} cột, {activeSheet.rowCount - 1} dòng dữ liệu):
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                      {activeSheet.columns.map((col) => (
                        <th key={col.index} className="p-2 border-r border-slate-200 whitespace-nowrap">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSheet.sampleRows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2 border-r border-slate-100 max-w-xs truncate text-slate-600">
                            {cell !== null ? String(cell) : <span className="text-slate-300 italic">trống</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `components/SelectorConfig.tsx`**

```tsx
// components/SelectorConfig.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Sliders, Plus, Trash2, Sparkles, HelpCircle } from "lucide-react";
import type { ExcelColumnInfo, TargetColumnConfig } from "@/types/crawler";

interface SelectorConfigProps {
  columns: ExcelColumnInfo[];
  totalRows: number;
  urlColIndex: number | null;
  onUrlColChange: (idx: number) => void;
  selectors: string[];
  onSelectorsChange: (selectors: string[]) => void;
  targetConfig: TargetColumnConfig;
  onTargetConfigChange: (config: TargetColumnConfig) => void;
  rowRange: { startRow: number; endRow: number };
  onRowRangeChange: (range: { startRow: number; endRow: number }) => void;
  onTestRequested: () => void;
}

const PRESETS = [
  {
    label: "Tiêu đề bài viết / Sản phẩm",
    selectors: ["h1.product-title", "h1.entry-title", "h1", ".title", "[itemprop='headline']"],
  },
  {
    label: "Giá sản phẩm",
    selectors: [".price", ".product-price", "[data-price]", "span.price", ".current-price"],
  },
  {
    label: "Mô tả / Đoạn văn chính",
    selectors: ["article p", ".description", ".post-content p", "main p", ".summary"],
  },
];

export default function SelectorConfig({
  columns,
  totalRows,
  urlColIndex,
  onUrlColChange,
  selectors,
  onSelectorsChange,
  targetConfig,
  onTargetConfigChange,
  rowRange,
  onRowRangeChange,
  onTestRequested,
}: SelectorConfigProps) {
  const [newSelectorInput, setNewSelectorInput] = useState("");
  const [customRangeEnabled, setCustomRangeEnabled] = useState(false);

  // Load saved selectors from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("excel_flow_saved_selectors");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          onSelectorsChange(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function updateSelectorsAndSave(newList: string[]) {
    onSelectorsChange(newList);
    try {
      localStorage.setItem("excel_flow_saved_selectors", JSON.stringify(newList));
    } catch {
      // ignore
    }
  }

  function handleAddSelector() {
    const trimmed = newSelectorInput.trim();
    if (trimmed && !selectors.includes(trimmed)) {
      const next = [...selectors, trimmed];
      updateSelectorsAndSave(next);
      setNewSelectorInput("");
    }
  }

  function handleRemoveSelector(index: number) {
    const next = selectors.filter((_, idx) => idx !== index);
    updateSelectorsAndSave(next);
  }

  function applyPreset(presetSelectors: string[]) {
    updateSelectorsAndSave(presetSelectors);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Sliders className="w-5 h-5 text-indigo-600" />
        Bước 2: Cấu hình trích xuất dữ liệu
      </h2>

      {/* URL Column & Target Column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* URL Column selection */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
            1. Chọn Cột chứa URL <span className="text-rose-500">*</span>
          </label>
          <select
            value={urlColIndex || ""}
            onChange={(e) => onUrlColChange(parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Bấm để chọn cột URL --</option>
            {columns.map((c) => (
              <option key={c.index} value={c.index}>
                Cột {c.index}: {c.header}
              </option>
            ))}
          </select>
        </div>

        {/* Target Column selection */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
            2. Cột Đích để điền dữ liệu <span className="text-rose-500">*</span>
          </label>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() =>
                onTargetConfigChange({
                  mode: "new",
                  colName: targetConfig.mode === "new" ? targetConfig.colName : "Extracted_Content",
                })
              }
              className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                targetConfig.mode === "new"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              + Tạo cột mới ở cuối bảng
            </button>
            <button
              type="button"
              onClick={() =>
                onTargetConfigChange({
                  mode: "existing",
                  colIndex: columns[0]?.index || 1,
                })
              }
              className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                targetConfig.mode === "existing"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Ghi vào cột đã có
            </button>
          </div>

          {targetConfig.mode === "new" ? (
            <input
              type="text"
              placeholder="Nhập tên tiêu đề cột mới (vd: Noi_Dung_Cao)"
              value={targetConfig.colName}
              onChange={(e) =>
                onTargetConfigChange({ mode: "new", colName: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ) : (
            <select
              value={targetConfig.colIndex}
              onChange={(e) =>
                onTargetConfigChange({
                  mode: "existing",
                  colIndex: parseInt(e.target.value, 10),
                })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  Ghi đè Cột {c.index}: {c.header}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Selectors List */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold uppercase text-slate-600 flex items-center gap-1">
            3. Danh sách CSS Selector (Fallback theo thứ tự ưu tiên từ trên xuống)
            <span className="text-rose-500">*</span>
          </label>
          <span className="text-xs text-slate-400">Thử lần lượt, lấy text của selector đầu tiên khớp</span>
        </div>

        {/* Preset quick buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Mẫu nhanh:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.selectors)}
              className="px-2.5 py-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-100 transition"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Add selector input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Nhập selector mới (ví dụ: h1.title, .product-price, #main-heading)..."
            value={newSelectorInput}
            onChange={(e) => setNewSelectorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSelector();
              }
            }}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddSelector}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1 transition"
          >
            <Plus className="w-4 h-4" /> Thêm
          </button>
        </div>

        {/* List of active selectors */}
        {selectors.length === 0 ? (
          <p className="text-xs text-amber-600 italic">Chưa có selector nào. Vui lòng thêm ít nhất 1 selector.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectors.map((sel, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold rounded-full text-[10px]">
                    {idx + 1}
                  </span>
                  <code className="font-mono text-slate-800">{sel}</code>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSelector(idx)}
                  className="p-1 text-slate-400 hover:text-rose-600 transition"
                  title="Xóa selector này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row range selection for large files */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-700">Phạm vi dòng cần cào:</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={!customRangeEnabled}
                onChange={() => {
                  setCustomRangeEnabled(false);
                  onRowRangeChange({ startRow: 2, endRow: totalRows });
                }}
              />
              <span>Toàn bộ file ({totalRows > 1 ? totalRows - 1 : 0} dòng)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="rangeType"
                checked={customRangeEnabled}
                onChange={() => setCustomRangeEnabled(true)}
              />
              <span>Chọn khoảng dòng</span>
            </label>
          </div>
        </div>

        {customRangeEnabled && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
            <span>Từ dòng:</span>
            <input
              type="number"
              min={2}
              max={totalRows}
              value={rowRange.startRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  startRow: Math.max(2, parseInt(e.target.value, 10) || 2),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center"
            />
            <span>Đến dòng:</span>
            <input
              type="number"
              min={rowRange.startRow}
              max={totalRows}
              value={rowRange.endRow}
              onChange={(e) =>
                onRowRangeChange({
                  ...rowRange,
                  endRow: Math.min(totalRows, parseInt(e.target.value, 10) || totalRows),
                })
              }
              className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-center"
            />
            <span className="text-slate-400">
              (Tổng: {Math.max(0, rowRange.endRow - rowRange.startRow + 1)} dòng)
            </span>
          </div>
        )}
      </div>

      {/* Test 1 URL button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onTestRequested}
          className="px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1.5 transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          Test thử selector trên 1 URL mẫu
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run build to verify types and components compile**

Run: `bun run build`
Expected: PASS with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add components/FileUploadZone.tsx components/SelectorConfig.tsx
git commit -m "feat: implement FileUploadZone and SelectorConfig UI components"
```

---

### Task 9: UI Components - Test Modal & Live Progress Dashboard

**Files:**
- Create: `components/TestSelectorModal.tsx`
- Create: `components/LiveProgressDashboard.tsx`
- Test: Verify build / typecheck via `bun run build`

**Interfaces:**
- Consumes:
  - `CrawlProgressEvent`, `CrawlRowResult`, `CrawlJobSummary` from `types/crawler.ts`
- Produces:
  - `TestSelectorModal`: Popover/modal testing the sample URL against backend and showing extracted text snippet.
  - `LiveProgressDashboard`: Real-time progress bar, statistics (total, success, failed, skipped), virtual capped table of 100 rows, Abort button, and Download file button.

- [ ] **Step 1: Implement `components/TestSelectorModal.tsx`**

```tsx
// components/TestSelectorModal.tsx
"use client";

import React, { useState } from "react";
import { X, CheckCircle, AlertCircle, Loader2, Clock, Globe } from "lucide-react";

interface TestSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleUrl: string;
  selectors: string[];
}

export default function TestSelectorModal({
  isOpen,
  onClose,
  sampleUrl,
  selectors,
}: TestSelectorModalProps) {
  const [testing, setTesting] = useState(false);
  const [testUrlInput, setTestUrlInput] = useState(sampleUrl);
  const [result, setResult] = useState<{
    success: boolean;
    matchedSelector?: string;
    textContent?: string;
    method?: string;
    durationMs?: number;
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  async function handleRunTest() {
    setTesting(true);
    setResult(null);

    try {
      const res = await fetch("/api/test-selector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrlInput, selectors }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ success: false, error: err?.message || "Lỗi kết nối kiểm tra." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-emerald-600" />
          Test Thử Selector Trên 1 URL Mẫu
        </h3>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 mb-1">URL kiểm tra:</label>
            <input
              type="text"
              value={testUrlInput}
              onChange={(e) => setTestUrlInput(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <span className="block font-medium text-slate-600 mb-1">
              Danh sách selector kiểm tra ({selectors.length}):
            </span>
            <div className="flex flex-wrap gap-1">
              {selectors.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px]">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={testing || !testUrlInput}
            onClick={handleRunTest}
            className="w-full py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải trang và phân tích DOM...
              </>
            ) : (
              "Bắt đầu Test Thử"
            )}
          </button>

          {result && (
            <div
              className={`p-3 rounded-xl border mt-3 ${
                result.success
                  ? "bg-emerald-50/70 border-emerald-200"
                  : "bg-rose-50/70 border-rose-200"
              }`}
            >
              {result.success ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-emerald-800 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600" /> Trích xuất thành công!
                    </span>
                    <span className="text-[11px] font-normal flex items-center gap-1 text-slate-500">
                      <Clock className="w-3 h-3" /> {result.durationMs}ms ({result.method})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Selector đã khớp:</span>
                    <code className="ml-1 px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-emerald-900 font-mono">
                      {result.matchedSelector}
                    </code>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">Nội dung textContent:</span>
                    <div className="p-2 bg-white rounded border border-emerald-200 text-slate-800 font-medium max-h-24 overflow-y-auto">
                      {result.textContent}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Không trích xuất được</p>
                    <p className="text-slate-600 mt-0.5">{result.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `components/LiveProgressDashboard.tsx`**

```tsx
// components/LiveProgressDashboard.tsx
"use client";

import React from "react";
import { Play, Square, Download, CheckCircle2, XCircle, AlertTriangle, Clock, Activity } from "lucide-react";
import type { CrawlJobSummary, CrawlRowResult } from "@/types/crawler";

interface LiveProgressDashboardProps {
  isRunning: boolean;
  progressPercent: number;
  processedCount: number;
  totalCount: number;
  etaSeconds: number;
  logs: CrawlRowResult[];
  summary: CrawlJobSummary | null;
  downloadId: string | null;
  onStart: () => void;
  onAbort: () => void;
  canStart: boolean;
}

export default function LiveProgressDashboard({
  isRunning,
  progressPercent,
  processedCount,
  totalCount,
  etaSeconds,
  logs,
  summary,
  downloadId,
  onStart,
  onAbort,
  canStart,
}: LiveProgressDashboardProps) {
  const formatTime = (sec: number) => {
    if (sec <= 0) return "Đang tính...";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-sky-600" />
          Bước 3 & 4: Tiến trình cào & Tải file kết quả
        </h2>

        <div className="flex items-center gap-3">
          {!isRunning && !downloadId && (
            <button
              type="button"
              disabled={!canStart}
              onClick={onStart}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition"
            >
              <Play className="w-4 h-4 fill-current" /> Bắt đầu xử lý
            </button>
          )}

          {isRunning && (
            <button
              type="button"
              onClick={onAbort}
              className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium hover:bg-rose-100 flex items-center gap-1.5 transition"
            >
              <Square className="w-4 h-4 fill-current text-rose-600" /> Dừng lại
            </button>
          )}

          {downloadId && (
            <a
              href={`/api/download/${downloadId}`}
              download
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold shadow-sm hover:bg-indigo-700 flex items-center gap-2 transition animate-bounce"
            >
              <Download className="w-4 h-4" /> Tải file Excel kết quả (.xlsx)
            </a>
          )}
        </div>
      </div>

      {/* Progress metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>
            Tiến độ: {processedCount}/{totalCount} dòng ({progressPercent}%)
          </span>
          {isRunning && (
            <span className="flex items-center gap-1 text-sky-600 font-normal">
              <Clock className="w-3.5 h-3.5" /> Còn lại khoảng: {formatTime(etaSeconds)}
            </span>
          )}
        </div>

        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats counter badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">Tổng số URL</p>
          <p className="text-lg font-bold text-slate-800">{totalCount}</p>
        </div>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-xs text-emerald-600">Thành công</p>
          <p className="text-lg font-bold text-emerald-700">
            {summary ? summary.succeeded : logs.filter((l) => l.status === "success").length}
          </p>
        </div>
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <p className="text-xs text-rose-600">Thất bại</p>
          <p className="text-lg font-bold text-rose-700">
            {summary ? summary.failed : logs.filter((l) => l.status === "failed").length}
          </p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-600">Bỏ qua / Trống</p>
          <p className="text-lg font-bold text-amber-700">
            {summary ? summary.skipped : logs.filter((l) => l.status === "skipped").length}
          </p>
        </div>
      </div>

      {/* Live Log / Virtual windowed table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase text-slate-500">
            Bảng theo dõi thời gian thực (Hiển thị tối đa 100 dòng mới nhất):
          </h3>
          {logs.length > 0 && (
            <span className="text-[11px] text-slate-400">Đã nhận {logs.length} sự kiện</span>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                <th className="p-2.5 w-16 text-center">Dòng</th>
                <th className="p-2.5 w-24">Trạng thái</th>
                <th className="p-2.5 w-60">URL</th>
                <th className="p-2.5 w-32">Selector</th>
                <th className="p-2.5">Nội dung trích xuất</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                    Chưa có hoạt động nào. Bấm &quot;Bắt đầu xử lý&quot; để chạy.
                  </td>
                </tr>
              ) : (
                logs.slice(-100).map((log, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2.5 text-center font-mono text-slate-500">{log.rowIndex}</td>
                    <td className="p-2.5">
                      {log.status === "success" && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Thành công
                        </span>
                      )}
                      {log.status === "failed" && (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" /> Lỗi
                        </span>
                      )}
                      {log.status === "skipped" && (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Bỏ qua
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 max-w-xs truncate text-slate-600 font-mono text-[11px]">
                      {log.url}
                    </td>
                    <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                      {log.matchedSelector || "-"}
                    </td>
                    <td className="p-2.5 text-slate-800 truncate max-w-md">
                      {log.text ? log.text : <span className="text-slate-400 italic">{log.error || "-"}</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run build to verify types and components compile**

Run: `bun run build`
Expected: PASS with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add components/TestSelectorModal.tsx components/LiveProgressDashboard.tsx
git commit -m "feat: implement TestSelectorModal and LiveProgressDashboard components"
```

---

### Task 10: Page Integration & End-to-End Verification

**Files:**
- Modify: `app/page.tsx`
- Create: `tests/e2e/workflow.test.ts`
- Test: Full build and execution verification

**Interfaces:**
- Consumes:
  - All components (`FileUploadZone`, `SelectorConfig`, `TestSelectorModal`, `LiveProgressDashboard`)
  - All API routes (`/api/crawl`, `/api/test-selector`, `/api/download/[id]`)

- [ ] **Step 1: Write integration test validating the end-to-end flow with sample Excel**

```typescript
// tests/e2e/workflow.test.ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import { enrichExcelBuffer, inspectExcelBuffer } from "../../lib/excel-service";
import { closeBrowser, scrapeHybrid } from "../../lib/scraper";
import { getTempFile, saveTempFile } from "../../lib/temp-store";

describe("End-to-End Workflow Integration", () => {
  let mockServer: any;

  beforeAll(() => {
    mockServer = Bun.serve({
      port: 3098,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/p1") {
          return new Response(
            `<html><body><h1 class="item-title">Smartphone XYZ</h1></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }
        if (url.pathname === "/p2") {
          return new Response(
            `<html><body><div class="product-heading">Laptop Pro 15</div></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }
        return new Response("Not found", { status: 404 });
      },
    });
  });

  afterAll(async () => {
    mockServer.stop();
    await closeBrowser();
  });

  it("completes full flow: inspect -> scrape -> enrich -> temp store -> download", async () => {
    // 1. Create workbook with 2 URLs
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("TestSheet");
    ws.addRow(["ID", "Link"]);
    ws.addRow([1, "http://localhost:3098/p1"]);
    ws.addRow([2, "http://localhost:3098/p2"]);
    const inputBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    // 2. Inspect Excel
    const summaries = await inspectExcelBuffer(inputBuffer);
    expect(summaries[0].name).toBe("TestSheet");
    expect(summaries[0].columns.length).toBe(2);

    // 3. Scrape using fallback selectors
    const selectors = ["h1.item-title", ".product-heading"];
    const results = new Map<number, string>();

    const r1 = await scrapeHybrid("http://localhost:3098/p1", selectors);
    expect(r1?.text).toBe("Smartphone XYZ");
    results.set(2, r1!.text);

    const r2 = await scrapeHybrid("http://localhost:3098/p2", selectors);
    expect(r2?.text).toBe("Laptop Pro 15");
    results.set(3, r2!.text);

    // 4. Enrich Excel with a new column
    const outputBuffer = await enrichExcelBuffer({
      buffer: inputBuffer,
      sheetName: "TestSheet",
      targetColumn: { mode: "new", colName: "Extracted_Name" },
      rowResults: results,
    });

    // 5. Save to temp store
    const downloadId = saveTempFile(outputBuffer, "result.xlsx");
    expect(downloadId).toBeDefined();

    // 6. Verify retrieved file has the enriched columns
    const file = getTempFile(downloadId);
    expect(file).not.toBeNull();

    const checkWb = new ExcelJS.Workbook();
    await checkWb.xlsx.load(file!.buffer);
    const checkWs = checkWb.getWorksheet("TestSheet");
    expect(checkWs?.getRow(1).getCell(3).value).toBe("Extracted_Name");
    expect(checkWs?.getRow(2).getCell(3).value).toBe("Smartphone XYZ");
    expect(checkWs?.getRow(3).getCell(3).value).toBe("Laptop Pro 15");
  });
});
```

- [ ] **Step 2: Run integration test to verify core flow passes**

Run: `bun test tests/e2e/workflow.test.ts`
Expected: PASS

- [ ] **Step 3: Update `app/page.tsx` with full integrated dashboard**

```tsx
// app/page.tsx
"use client";

import React, { useRef, useState } from "react";
import FileUploadZone from "@/components/FileUploadZone";
import SelectorConfig from "@/components/SelectorConfig";
import LiveProgressDashboard from "@/components/LiveProgressDashboard";
import TestSelectorModal from "@/components/TestSelectorModal";
import type {
  CrawlJobSummary,
  CrawlRowResult,
  ExcelSheetSummary,
  TargetColumnConfig,
} from "@/types/crawler";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ExcelSheetSummary[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  const [urlColIndex, setUrlColIndex] = useState<number | null>(null);
  const [selectors, setSelectors] = useState<string[]>([
    "h1.product-title",
    "h1.entry-title",
    "h1",
    ".title",
  ]);
  const [targetConfig, setTargetConfig] = useState<TargetColumnConfig>({
    mode: "new",
    colName: "Extracted_Content",
  });
  const [rowRange, setRowRange] = useState<{ startRow: number; endRow: number }>({
    startRow: 2,
    endRow: 100,
  });

  // Crawler runtime states
  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [logs, setLogs] = useState<CrawlRowResult[]>([]);
  const [summary, setSummary] = useState<CrawlJobSummary | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);

  // Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeSheet = sheets.find((s) => s.name === selectedSheet) || sheets[0];

  function handleFileLoaded(loadedFile: File, loadedSheets: ExcelSheetSummary[]) {
    setFile(loadedFile);
    setSheets(loadedSheets);
    if (loadedSheets.length > 0) {
      const firstSheet = loadedSheets[0];
      setSelectedSheet(firstSheet.name);
      setRowRange({ startRow: 2, endRow: firstSheet.rowCount });

      // Automatically guess URL column if header contains 'url', 'link', 'web'
      const foundUrlCol = firstSheet.columns.find((c) =>
        /url|link|href|web|trang/i.test(c.header)
      );
      if (foundUrlCol) {
        setUrlColIndex(foundUrlCol.index);
      } else if (firstSheet.columns.length > 1) {
        setUrlColIndex(firstSheet.columns[1].index);
      }
    }
    // Reset crawl state
    setLogs([]);
    setSummary(null);
    setDownloadId(null);
    setProgressPercent(0);
    setProcessedCount(0);
  }

  // Get sample URL from row 2
  function getSampleUrl(): string {
    if (!activeSheet || !urlColIndex) return "https://example.com";
    const sampleRow = activeSheet.sampleRows[0];
    if (!sampleRow) return "https://example.com";
    const colPosition = activeSheet.columns.findIndex((c) => c.index === urlColIndex);
    return colPosition !== -1 && sampleRow[colPosition]
      ? String(sampleRow[colPosition])
      : "https://example.com";
  }

  async function handleStartCrawl() {
    if (!file || !urlColIndex || selectors.length === 0) return;

    setIsRunning(true);
    setLogs([]);
    setSummary(null);
    setDownloadId(null);
    setProgressPercent(0);
    setProcessedCount(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sheetName", selectedSheet);
    formData.append("urlColIndex", urlColIndex.toString());
    formData.append("targetColumnConfig", JSON.stringify(targetConfig));
    formData.append("selectors", JSON.stringify(selectors));
    formData.append("rowRange", JSON.stringify(rowRange));

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/crawl", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;
          const lines = rawEvent.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.replace("data: ", "").trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === "start") {
              setTotalCount(data.totalRows);
            } else if (eventType === "row_progress") {
              setProgressPercent(data.progressPercent);
              setProcessedCount(data.processedCount);
              setTotalCount(data.totalCount);
              setEtaSeconds(data.etaSeconds);
              setLogs((prev) => [
                ...prev,
                {
                  rowIndex: data.rowIndex,
                  url: data.url,
                  status: data.status,
                  matchedSelector: data.matchedSelector,
                  text: data.text,
                  error: data.error,
                },
              ]);
            } else if (eventType === "complete") {
              setDownloadId(data.downloadId);
              setSummary(data.summary);
              setProgressPercent(100);
            } else if (eventType === "error") {
              alert(`Lỗi: ${data.message}`);
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        alert(`Lỗi trong quá trình cào: ${err.message}`);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }

  function handleAbort() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-6 px-4 md:px-8 mb-8 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <span className="p-1.5 bg-emerald-600 text-white rounded-lg text-lg">⚡</span>
              Excel Web Scraper & Enricher
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Tải file Excel lên, chọn cột URL, tự động cào textContent theo CSS Selector và xuất file hoàn chỉnh.
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
            v1.0.0 • Hybrid Scraper
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 md:px-8 space-y-6">
        <FileUploadZone
          onFileLoaded={handleFileLoaded}
          selectedSheet={selectedSheet}
          onSheetChange={setSelectedSheet}
        />

        {file && activeSheet && (
          <SelectorConfig
            columns={activeSheet.columns}
            totalRows={activeSheet.rowCount}
            urlColIndex={urlColIndex}
            onUrlColChange={setUrlColIndex}
            selectors={selectors}
            onSelectorsChange={setSelectors}
            targetConfig={targetConfig}
            onTargetConfigChange={setTargetConfig}
            rowRange={rowRange}
            onRowRangeChange={setRowRange}
            onTestRequested={() => setIsTestModalOpen(true)}
          />
        )}

        {file && (
          <LiveProgressDashboard
            isRunning={isRunning}
            progressPercent={progressPercent}
            processedCount={processedCount}
            totalCount={totalCount || (activeSheet?.rowCount ? activeSheet.rowCount - 1 : 0)}
            etaSeconds={etaSeconds}
            logs={logs}
            summary={summary}
            downloadId={downloadId}
            onStart={handleStartCrawl}
            onAbort={handleAbort}
            canStart={Boolean(file && urlColIndex && selectors.length > 0 && !isRunning)}
          />
        )}
      </main>

      {/* Test Selector Modal */}
      <TestSelectorModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        sampleUrl={getSampleUrl()}
        selectors={selectors}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run full test suite & production build to verify zero errors**

Run: `bun test`
Run: `bun run build`
Expected: All tests PASS and Next.js build succeeds with zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/e2e/
git commit -m "feat: complete end-to-end integration of Excel Web Scraper"
```
