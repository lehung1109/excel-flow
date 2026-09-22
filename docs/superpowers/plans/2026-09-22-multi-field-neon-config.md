# Multi-Field Extraction & Neon DB Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-field extraction from single URLs to multiple target Excel columns, display informative text notes when creating new columns, remove quick presets, and integrate Neon Postgres on Vercel for persistent configuration management.

**Architecture:** Install `@neondatabase/serverless` to connect to Vercel Neon DB; build REST API routes `/api/configs` with an auto-migrating `saved_configs` table; upgrade `scraper.ts` to `scrapeMultiField` (1 page fetch per URL, extracting multiple fields); upgrade `excel-service.ts` to `enrichExcelBufferMultiField`; revamp `SelectorConfig.tsx` to manage extraction fields, remove presets, and show text notes when creating new columns; and update `page.tsx`, `TestSelectorModal.tsx`, and `LiveProgressDashboard.tsx` for full end-to-end multi-field support.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Bun, `@neondatabase/serverless`, ExcelJS, Cheerio, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-multi-field-neon-config-design.md`

## Global Constraints

- Preserve all existing tests, Excel styling, formula preservation, and Playwright worker bridge logic.
- Neon DB connection must use `process.env.DATABASE_URL || process.env.POSTGRES_URL`.
- If database connection is not available, the app must degrade gracefully (crawl continues without database persistence, with clear UI notification).
- Remove static quick presets (`PRESETS`) completely.
- When creating new columns in Excel, a visible callout Text Note must appear in UI informing the user what column will be created.

---

### Task 1: Core Types & Database Layer

**Files:**
- Create: `lib/db.ts`
- Modify: `types/crawler.ts`
- Test: `lib/__tests__/db.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL || process.env.POSTGRES_URL`
- Produces:
  - `ExtractionFieldConfig`, `SavedConfigRecord`, `FieldCrawlResult` in `types/crawler.ts`
  - `initDb()`, `getSavedConfigs()`, `createSavedConfig()`, `updateSavedConfig()`, `deleteSavedConfig()` in `lib/db.ts`

- [ ] **Step 1: Install `@neondatabase/serverless` dependency**

Run: `bun add @neondatabase/serverless`

- [ ] **Step 2: Update `types/crawler.ts` with multi-field and Neon types**

```typescript
export type TargetColumnConfig =
  | { mode: "existing"; colIndex: number }
  | { mode: "new"; colName: string };

export interface ExtractionFieldConfig {
  id: string;
  name: string;
  selectors: string[];
  targetColumn: TargetColumnConfig;
}

export interface SavedConfigRecord {
  id: number;
  name: string;
  description?: string | null;
  fields: ExtractionFieldConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldCrawlResult {
  text: string;
  matchedSelector?: string;
  error?: string;
}

export interface MultiFieldRowResult {
  rowIndex: number;
  url: string;
  status: CrawlStatus;
  fieldResults: Record<string, FieldCrawlResult>;
  error?: string;
}
```

- [ ] **Step 3: Write the failing test for `lib/db.ts`**

Create `lib/__tests__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  initDb,
  getSavedConfigs,
  createSavedConfig,
  updateSavedConfig,
  deleteSavedConfig,
  setSqlExecutorForTesting,
} from "../db";
import type { ExtractionFieldConfig } from "@/types/crawler";

describe("Neon DB Layer", () => {
  const mockRows: any[] = [];
  const mockSql = mock((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");
    if (query.includes("CREATE TABLE")) {
      return Promise.resolve([]);
    }
    if (query.includes("SELECT id, name, description, fields, created_at, updated_at")) {
      return Promise.resolve(mockRows);
    }
    if (query.includes("INSERT INTO saved_configs")) {
      const inserted = {
        id: mockRows.length + 1,
        name: values[0],
        description: values[1],
        fields: typeof values[2] === "string" ? JSON.parse(values[2]) : values[2],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockRows.push(inserted);
      return Promise.resolve([inserted]);
    }
    if (query.includes("UPDATE saved_configs")) {
      const id = values[3];
      const found = mockRows.find((r) => r.id === id);
      if (found) {
        found.name = values[0];
        found.description = values[1];
        found.fields = typeof values[2] === "string" ? JSON.parse(values[2]) : values[2];
        found.updated_at = new Date().toISOString();
        return Promise.resolve([found]);
      }
      return Promise.resolve([]);
    }
    if (query.includes("DELETE FROM saved_configs")) {
      const id = values[0];
      const idx = mockRows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const deleted = mockRows.splice(idx, 1);
        return Promise.resolve(deleted);
      }
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  beforeEach(() => {
    mockRows.length = 0;
    setSqlExecutorForTesting(mockSql as any);
  });

  it("initializes table schema successfully", async () => {
    await expect(initDb()).resolves.toBeUndefined();
  });

  it("creates, retrieves, updates, and deletes saved configs", async () => {
    const fields: ExtractionFieldConfig[] = [
      {
        id: "f1",
        name: "Tiêu đề",
        selectors: ["h1"],
        targetColumn: { mode: "new", colName: "Tieu_De" },
      },
    ];

    const created = await createSavedConfig("Config 1", "Mô tả 1", fields);
    expect(created.id).toBe(1);
    expect(created.name).toBe("Config 1");
    expect(created.fields).toEqual(fields);

    const list = await getSavedConfigs();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Config 1");

    const updated = await updateSavedConfig(1, "Config 1 Updated", "Mô tả mới", fields);
    expect(updated?.name).toBe("Config 1 Updated");

    const deleted = await deleteSavedConfig(1);
    expect(deleted).toBe(true);

    const listAfterDelete = await getSavedConfigs();
    expect(listAfterDelete.length).toBe(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test lib/__tests__/db.test.ts`
Expected: FAIL (module `../db` not found).

- [ ] **Step 5: Implement `lib/db.ts`**

```typescript
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ExtractionFieldConfig, SavedConfigRecord } from "@/types/crawler";

let customSqlExecutor: NeonQueryFunction<false, false> | null = null;

export function setSqlExecutorForTesting(executor: NeonQueryFunction<false, false> | null) {
  customSqlExecutor = executor;
}

export function getSql() {
  if (customSqlExecutor) {
    return customSqlExecutor;
  }
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("Neon DATABASE_URL or POSTGRES_URL environment variable is missing.");
  }
  return neon(connectionString);
}

export async function initDb(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS saved_configs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      fields JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

export async function getSavedConfigs(): Promise<SavedConfigRecord[]> {
  const sql = getSql();
  await initDb();
  const rows = await sql`
    SELECT id, name, description, fields, created_at, updated_at
    FROM saved_configs
    ORDER BY updated_at DESC
  `;
  return rows.map((r: any) => ({
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function createSavedConfig(
  name: string,
  description: string | null | undefined,
  fields: ExtractionFieldConfig[]
): Promise<SavedConfigRecord> {
  const sql = getSql();
  await initDb();
  const fieldsJson = JSON.stringify(fields);
  const rows = await sql`
    INSERT INTO saved_configs (name, description, fields, updated_at)
    VALUES (${name.trim()}, ${description?.trim() || null}, ${fieldsJson}::jsonb, CURRENT_TIMESTAMP)
    RETURNING id, name, description, fields, created_at, updated_at
  `;
  const r = rows[0];
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function updateSavedConfig(
  id: number,
  name: string,
  description: string | null | undefined,
  fields: ExtractionFieldConfig[]
): Promise<SavedConfigRecord | null> {
  const sql = getSql();
  await initDb();
  const fieldsJson = JSON.stringify(fields);
  const rows = await sql`
    UPDATE saved_configs
    SET name = ${name.trim()}, description = ${description?.trim() || null}, fields = ${fieldsJson}::jsonb, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, name, description, fields, created_at, updated_at
  `;
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function deleteSavedConfig(id: number): Promise<boolean> {
  const sql = getSql();
  await initDb();
  const rows = await sql`
    DELETE FROM saved_configs
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test lib/__tests__/db.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json types/crawler.ts lib/db.ts lib/__tests__/db.test.ts
git commit -m "feat(db): implement Neon database layer with saved_configs schema"
```

---

### Task 2: Config Management REST APIs

**Files:**
- Create: `app/api/configs/route.ts`
- Create: `app/api/configs/[id]/route.ts`
- Test: `app/api/configs/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `lib/db.ts` methods
- Produces:
  - `GET /api/configs`: Returns `{ success: true, configs: SavedConfigRecord[] }`
  - `POST /api/configs`: Returns `{ success: true, config: SavedConfigRecord }`
  - `PUT /api/configs/[id]`: Returns `{ success: true, config: SavedConfigRecord }`
  - `DELETE /api/configs/[id]`: Returns `{ success: true }`

- [ ] **Step 1: Write failing tests for `/api/configs` routes**

Create `app/api/configs/__tests__/route.test.ts`:
```typescript
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { GET as getConfigs, POST as postConfig } from "../route";
import { PUT as putConfig, DELETE as deleteConfig } from "../[id]/route";
import * as db from "@/lib/db";

describe("Configs API Routes", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("GET /api/configs returns configs list", async () => {
    spyOn(db, "getSavedConfigs").mockResolvedValue([
      {
        id: 1,
        name: "Test Config",
        description: "Desc",
        fields: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const req = new Request("http://localhost:3000/api/configs");
    const res = await getConfigs(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.configs.length).toBe(1);
  });

  it("POST /api/configs validates required fields and creates config", async () => {
    spyOn(db, "createSavedConfig").mockResolvedValue({
      id: 2,
      name: "New Config",
      description: null,
      fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const badReq = new Request("http://localhost:3000/api/configs", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const badRes = await postConfig(badReq as any);
    expect(badRes.status).toBe(400);

    const goodReq = new Request("http://localhost:3000/api/configs", {
      method: "POST",
      body: JSON.stringify({
        name: "New Config",
        fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const goodRes = await postConfig(goodReq as any);
    const json = await goodRes.json();

    expect(goodRes.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.config.id).toBe(2);
  });

  it("PUT /api/configs/[id] updates existing config", async () => {
    spyOn(db, "updateSavedConfig").mockResolvedValue({
      id: 2,
      name: "Updated Config",
      description: null,
      fields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = new Request("http://localhost:3000/api/configs/2", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Config", fields: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putConfig(req as any, { params: Promise.resolve({ id: "2" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.config.name).toBe("Updated Config");
  });

  it("DELETE /api/configs/[id] deletes config", async () => {
    spyOn(db, "deleteSavedConfig").mockResolvedValue(true);

    const req = new Request("http://localhost:3000/api/configs/2", { method: "DELETE" });
    const res = await deleteConfig(req as any, { params: Promise.resolve({ id: "2" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/configs/__tests__/route.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `app/api/configs/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSavedConfigs, createSavedConfig } from "@/lib/db";

export async function GET() {
  try {
    const configs = await getSavedConfigs();
    return NextResponse.json({ success: true, configs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi tải danh sách cấu hình từ database.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, fields } = body || {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Tên cấu hình không được để trống." },
        { status: 400 }
      );
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cấu hình phải có ít nhất 1 trường bóc tách." },
        { status: 400 }
      );
    }

    const config = await createSavedConfig(name, description, fields);
    return NextResponse.json({ success: true, config }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi lưu cấu hình vào database.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement `app/api/configs/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateSavedConfig, deleteSavedConfig } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID không hợp lệ." }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, fields } = body || {};

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Tên cấu hình không được để trống." }, { status: 400 });
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ success: false, error: "Cấu hình phải có ít nhất 1 trường bóc tách." }, { status: 400 });
    }

    const updated = await updateSavedConfig(id, name, description, fields);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Không tìm thấy cấu hình để cập nhật." }, { status: 404 });
    }

    return NextResponse.json({ success: true, config: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi cập nhật cấu hình.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = parseInt(rawId, 10);
    if (isNaN(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "ID không hợp lệ." }, { status: 400 });
    }

    const success = await deleteSavedConfig(id);
    if (!success) {
      return NextResponse.json({ success: false, error: "Không tìm thấy cấu hình để xóa." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi xóa cấu hình.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test app/api/configs/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/configs/
git commit -m "feat(api): implement /api/configs CRUD endpoints for Neon DB"
```

---

### Task 3: Multi-Field Scraping Engine

**Files:**
- Modify: `lib/scraper.ts`
- Modify: `lib/__tests__/scraper.test.ts`

**Interfaces:**
- Consumes: Cheerio, Playwright fallback, `sanitizeExtractedText`
- Produces: `scrapeMultiField(url: string, fields: { id: string; selectors: string[] }[]): Promise<Record<string, { text: string; matchedSelector?: string } | null>>`

- [ ] **Step 1: Write failing unit test for `scrapeMultiField` in `lib/__tests__/scraper.test.ts`**

Add to `lib/__tests__/scraper.test.ts`:
```typescript
it("scrapeMultiField extracts multiple fields from single HTML page concurrently", async () => {
  const mockHtml = `
    <html>
      <body>
        <h1 class="product-title">Áo Thun Nam Cao Cấp</h1>
        <div class="product-price">199.000đ</div>
        <p class="desc">Chất liệu 100% cotton thoáng mát.</p>
      </body>
    </html>
  `;
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(mockHtml, { status: 200 }))
  ) as any;

  const fields = [
    { id: "f_title", selectors: ["h1.product-title", "h1"] },
    { id: "f_price", selectors: [".product-price", ".price"] },
    { id: "f_desc", selectors: [".desc", "p"] },
    { id: "f_nonexist", selectors: [".not-found"] },
  ];

  const results = await scraper.scrapeMultiField("https://shop.example/p1", fields);

  expect(results.f_title?.text).toBe("Áo Thun Nam Cao Cấp");
  expect(results.f_title?.matchedSelector).toBe("h1.product-title");

  expect(results.f_price?.text).toBe("199.000đ");
  expect(results.f_price?.matchedSelector).toBe(".product-price");

  expect(results.f_desc?.text).toBe("Chất liệu 100% cotton thoáng mát.");

  expect(results.f_nonexist).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/scraper.test.ts`
Expected: FAIL (`scrapeMultiField` is not a function).

- [ ] **Step 3: Implement `scrapeMultiField` in `lib/scraper.ts`**

In `lib/scraper.ts`, implement:
```typescript
export interface MultiFieldTarget {
  id: string;
  selectors: string[];
}

export interface MultiFieldMatch {
  text: string;
  matchedSelector: string;
}

export async function scrapeMultiField(
  url: string,
  fields: MultiFieldTarget[]
): Promise<Record<string, MultiFieldMatch | null>> {
  const result: Record<string, MultiFieldMatch | null> = {};
  for (const f of fields) {
    result[f.id] = null;
  }

  // 1. Attempt static scrape with Cheerio first
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      html = await res.text();
    }
  } catch {
    // static fetch failed, may try browser
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
    const browserResult = await scrapeBrowserMulti(url, missingFields);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/__tests__/scraper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scraper.ts lib/__tests__/scraper.test.ts
git commit -m "feat(scraper): implement scrapeMultiField for single-fetch multi-selector extraction"
```

---

### Task 4: Multi-Field Excel Enrichment Engine

**Files:**
- Modify: `lib/excel-service.ts`
- Modify: `lib/__tests__/excel-service.test.ts`

**Interfaces:**
- Consumes: ExcelJS, `ExtractionFieldConfig`, `rowResults: Map<number, Record<string, string>>`
- Produces: `enrichExcelBufferMultiField(options): Promise<Buffer>`

- [ ] **Step 1: Write failing unit test for `enrichExcelBufferMultiField`**

In `lib/__tests__/excel-service.test.ts`:
```typescript
it("enrichExcelBufferMultiField enriches Excel with multiple existing and new columns", async () => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Products");
  ws.addRow(["ID", "URL", "OldCol"]);
  ws.addRow([1, "https://example.com/1", "OldValue1"]);
  ws.addRow([2, "https://example.com/2", "OldValue2"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const fields: ExtractionFieldConfig[] = [
    {
      id: "f1",
      name: "Title",
      selectors: ["h1"],
      targetColumn: { mode: "new", colName: "Extracted_Title" },
    },
    {
      id: "f2",
      name: "Price",
      selectors: [".price"],
      targetColumn: { mode: "new", colName: "Extracted_Price" },
    },
    {
      id: "f3",
      name: "OldColUpdate",
      selectors: [".note"],
      targetColumn: { mode: "existing", colIndex: 3 },
    },
  ];

  const rowResults = new Map<number, Record<string, string>>([
    [2, { f1: "Item 1 Title", f2: "100k", f3: "New Note 1" }],
    [3, { f1: "Item 2 Title", f2: "200k", f3: "New Note 2" }],
  ]);

  const outputBuffer = await enrichExcelBufferMultiField({
    buffer,
    sheetName: "Products",
    fields,
    rowResults,
  });

  const resWb = new ExcelJS.Workbook();
  await resWb.xlsx.load(outputBuffer as unknown as ExcelJS.Buffer);
  const resWs = resWb.getWorksheet("Products")!;

  expect(resWs.getRow(1).getCell(3).value).toBe("OldCol");
  expect(resWs.getRow(1).getCell(4).value).toBe("Extracted_Title");
  expect(resWs.getRow(1).getCell(5).value).toBe("Extracted_Price");

  expect(resWs.getRow(2).getCell(3).value).toBe("New Note 1");
  expect(resWs.getRow(2).getCell(4).value).toBe("Item 1 Title");
  expect(resWs.getRow(2).getCell(5).value).toBe("100k");

  expect(resWs.getRow(3).getCell(3).value).toBe("New Note 2");
  expect(resWs.getRow(3).getCell(4).value).toBe("Item 2 Title");
  expect(resWs.getRow(3).getCell(5).value).toBe("200k");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/__tests__/excel-service.test.ts`
Expected: FAIL (`enrichExcelBufferMultiField` is not defined).

- [ ] **Step 3: Implement `enrichExcelBufferMultiField` in `lib/excel-service.ts`**

```typescript
export interface EnrichExcelMultiFieldOptions {
  buffer: Buffer;
  sheetName: string;
  fields: ExtractionFieldConfig[];
  rowResults: Map<number, Record<string, string>>; // rowIndex -> { [fieldId]: text }
}

export async function enrichExcelBufferMultiField(
  options: EnrichExcelMultiFieldOptions
): Promise<Buffer> {
  const { buffer, sheetName, fields, rowResults } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Worksheet '${sheetName}' not found in Excel workbook.`);
  }

  const headerRow = worksheet.getRow(1);
  let maxCol = 0;
  headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    if (colNumber > maxCol) {
      maxCol = colNumber;
    }
  });

  // Map each field to its assigned column index in the sheet
  const fieldColumnMap = new Map<string, number>();

  for (const field of fields) {
    if (field.targetColumn.mode === "existing") {
      fieldColumnMap.set(field.id, field.targetColumn.colIndex);
    } else {
      maxCol += 1;
      const targetColIndex = maxCol;
      fieldColumnMap.set(field.id, targetColIndex);

      const headerCell = headerRow.getCell(targetColIndex);
      headerCell.value = field.targetColumn.colName;
      headerCell.font = { bold: true };
    }
  }

  // Populate row values
  for (const [rowIndex, fieldValues] of rowResults.entries()) {
    const row = worksheet.getRow(rowIndex);
    for (const [fieldId, text] of Object.entries(fieldValues)) {
      const colIndex = fieldColumnMap.get(fieldId);
      if (colIndex && text !== undefined && text !== null) {
        row.getCell(colIndex).value = text;
      }
    }
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outputBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/__tests__/excel-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/excel-service.ts lib/__tests__/excel-service.test.ts
git commit -m "feat(excel): implement enrichExcelBufferMultiField for multi-column mapping"
```

---

### Task 5: Crawl API & Test Selector API Multi-Field Support

**Files:**
- Modify: `app/api/crawl/route.ts`
- Modify: `app/api/test-selector/route.ts`
- Modify: `app/api/crawl/__tests__/route.test.ts`
- Modify: `app/api/test-selector/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `scrapeMultiField`, `enrichExcelBufferMultiField`
- Produces:
  - `POST /api/crawl`: accepts `fields` JSON in formData, streams multi-field `row_progress` events.
  - `POST /api/test-selector`: accepts `{ url: string, fields?: ExtractionFieldConfig[], selectors?: string[] }`.

- [ ] **Step 1: Write failing tests for multi-field crawling and testing**

Update `app/api/crawl/__tests__/route.test.ts` and `app/api/test-selector/__tests__/route.test.ts` to test multi-field input parsing and event streaming.

- [ ] **Step 2: Run tests to verify failures**

Run: `bun test app/api/crawl/__tests__/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `app/api/crawl/route.ts` and `app/api/test-selector/route.ts`**

- In `app/api/crawl/route.ts`:
  - Support `fields` JSON in formData. If legacy `selectors` + `targetColumnConfig` are passed, automatically convert to single field for backward compatibility.
  - Call `scrapeMultiField` per row.
  - Stream multi-field `row_progress` SSE event with `fieldResults`.
  - Call `enrichExcelBufferMultiField`.
- In `app/api/test-selector/route.ts`:
  - If `fields` array is provided, run `scrapeMultiField` and return `results: Record<string, FieldCrawlResult>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test app/api/crawl/__tests__/route.test.ts app/api/test-selector/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/crawl/ app/api/test-selector/
git commit -m "feat(api): upgrade crawl and test-selector APIs to support multi-field extraction"
```

---

### Task 6: Revamped SelectorConfig UI Component

**Files:**
- Modify: `components/SelectorConfig.tsx`
- Modify: `components/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: `columns: ExcelColumnInfo[]`, `fields: ExtractionFieldConfig[]`, `onFieldsChange`
- Produces:
  - Multi-field cards with add/remove
  - Informative Text Note callout when `mode: "new"`
  - Neon DB Config Manager toolbar (Save, Load, Delete configs)
  - Completely removed quick presets (`PRESETS`)

- [ ] **Step 1: Write failing component tests in `components/__tests__/components.test.tsx`**

```typescript
it("SelectorConfig renders multi-field manager and does NOT render quick presets", () => {
  // test that PRESETS buttons are absent
  // test that Add Field button exists
  // test that Text Note callout appears when mode is new
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test components/__tests__/components.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Revamp `components/SelectorConfig.tsx`**

1. Remove `PRESETS` array and the quick preset buttons block completely.
2. Add Neon DB Saved Configs dropdown + "💾 Lưu cấu hình này" modal + Delete button.
3. Add Field Card list with "Thêm trường cần lấy" button.
4. For each field, render:
   - Name input (e.g., "Tiêu đề", "Giá")
   - CSS Selectors input + chips list
   - Target Column: `Tạo cột mới ở cuối bảng` vs `Ghi vào cột đã có`
   - When `mode: "new"`, display the Callout Text Note:
     ```tsx
     <div className="mt-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800 flex items-start gap-2">
       <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
       <div>
         <strong>Ghi chú:</strong> Hệ thống sẽ tự động tạo một cột mới có tiêu đề là{" "}
         <span className="font-semibold underline">{field.targetColumn.colName || "(chưa đặt tên)"}</span>{" "}
         ở cuối bảng tính Excel để điền nội dung bóc tách được của trường này.
       </div>
     </div>
     ```
   - When `colName` is empty, show warning text note:
     ```tsx
     <p className="mt-1 text-xs text-amber-600 font-medium">
       ⚠️ Vui lòng nhập tên tiêu đề cho cột mới trước khi tiến hành cào.
     </p>
     ```

- [ ] **Step 4: Run component tests to verify they pass**

Run: `bun test components/__tests__/components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SelectorConfig.tsx components/__tests__/components.test.tsx
git commit -m "feat(ui): revamp SelectorConfig with multi-field cards, new-column text notes, and Neon config sync"
```

---

### Task 7: Test Selector Modal & Progress Dashboard Multi-Field Updates

**Files:**
- Modify: `components/TestSelectorModal.tsx`
- Modify: `components/LiveProgressDashboard.tsx`
- Modify: `components/__tests__/dashboard.test.tsx`

**Interfaces:**
- Consumes: `fields: ExtractionFieldConfig[]`, `MultiFieldRowResult`
- Produces:
  - Multi-field test preview in `TestSelectorModal.tsx`
  - Real-time row logs table displaying all extracted fields per row in `LiveProgressDashboard.tsx`

- [ ] **Step 1: Write failing tests in `components/__tests__/dashboard.test.tsx`**

Test multi-field preview rendering and multi-field row log columns.

- [ ] **Step 2: Run test to verify failure**

Run: `bun test components/__tests__/dashboard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `TestSelectorModal.tsx` and `LiveProgressDashboard.tsx`**

- In `TestSelectorModal.tsx`:
  - Show preview results for each configured field (Field Name, Matched Selector, Extracted text).
- In `LiveProgressDashboard.tsx`:
  - Display extracted values badge per field in the log table.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test components/__tests__/dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/TestSelectorModal.tsx components/LiveProgressDashboard.tsx components/__tests__/dashboard.test.tsx
git commit -m "feat(ui): update TestSelectorModal and LiveProgressDashboard for multi-field extraction display"
```

---

### Task 8: Page Integration & End-to-End Workflow Verification

**Files:**
- Modify: `app/page.tsx`
- Modify: `tests/e2e/workflow.test.ts`

**Interfaces:**
- Consumes: All updated components, APIs, and types.
- Produces: Fully functional ExcelFlow v2 application.

- [ ] **Step 1: Update `app/page.tsx` to integrate multi-field state**

- Replace single `selectors` & `targetConfig` state with `fields: ExtractionFieldConfig[]`.
- Pass `fields` into `/api/crawl` and `/api/test-selector`.
- Handle multi-field SSE updates.

- [ ] **Step 2: Update `tests/e2e/workflow.test.ts`**

- Test end-to-end flow with 2 fields (Title -> new column, Price -> new column).
- Verify generated Excel workbook contains both new columns with correct values.

- [ ] **Step 3: Run all tests in the repository**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 4: Run typecheck and linting**

Run: `bun run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/e2e/workflow.test.ts
git commit -m "feat: complete end-to-end integration of multi-field extraction and Neon DB config"
```
