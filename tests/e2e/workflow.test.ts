import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import ExcelJS from "exceljs";
import { inspectExcelBuffer, enrichExcelBuffer } from "@/lib/excel-service";
import { scrapeHybrid, closeBrowser } from "@/lib/scraper";
import { saveTempFile, getTempFile } from "@/lib/temp-store";
import { normalizeUrl } from "@/lib/url-utils";

describe("End-to-End Workflow Integration Test", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/product-1") {
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Product 1</title></head>
              <body>
                <h1 class="product-title">Wireless Noise-Canceling Headphones</h1>
                <span class="price">$199.99</span>
                <p class="description">Premium audio with active noise cancellation.</p>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        if (url.pathname === "/product-2") {
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Product 2</title></head>
              <body>
                <h1 class="entry-title">Mechanical Gaming Keyboard</h1>
                <span class="price">$89.50</span>
                <p class="description">Tactile mechanical switches with RGB backlight.</p>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        if (url.pathname === "/product-3") {
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Product 3</title></head>
              <body>
                <div class="title">Ultra HD Smart Monitor</div>
                <span class="price">$329.00</span>
                <p class="description">4K crystal clear resolution for creators.</p>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    server.stop(true);
    await closeBrowser();
  });

  it("completes full workflow: inspect, scrape, enrich with new column, save to temp-store, and verify output", async () => {
    // 1. Create in-memory Excel workbook with URLs
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Products");

    // Header row (Row 1)
    sheet.addRow(["ID", "Product Name", "Product URL", "Current Price"]);

    // Data rows (Rows 2 - 5)
    sheet.addRow([101, "Headphones", `${baseUrl}/product-1`, 199.99]);
    sheet.addRow([102, "Keyboard", `${baseUrl}/product-2`, 89.5]);
    sheet.addRow([103, "Monitor", `${baseUrl}/product-3`, 329.0]);
    sheet.addRow([104, "Invalid URL Row", "invalid://not-a-web-url", 0]);
    sheet.addRow([105, "Unprocessed Row", "", 50]);

    const initialBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // 2. Inspect Excel workbook using inspectExcelBuffer
    const summaries = await inspectExcelBuffer(initialBuffer);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe("Products");
    expect(summaries[0].rowCount).toBe(6);
    expect(summaries[0].columns.map((c) => c.header)).toEqual([
      "ID",
      "Product Name",
      "Product URL",
      "Current Price",
    ]);
    expect(summaries[0].sampleRows.length).toBeGreaterThanOrEqual(5);

    // 3. Scrape pages using scrapeHybrid
    const selectors = [
      "h1.product-title",
      "h1.entry-title",
      ".title",
      "[itemprop='headline']",
    ];

    const rowResults = new Map<number, string>();
    const rowsToProcess = [
      { rowIndex: 2, rawUrl: `${baseUrl}/product-1` },
      { rowIndex: 3, rawUrl: `${baseUrl}/product-2` },
      { rowIndex: 4, rawUrl: `${baseUrl}/product-3` },
      { rowIndex: 5, rawUrl: "invalid://not-a-web-url" },
      { rowIndex: 6, rawUrl: "" },
    ];

    for (const item of rowsToProcess) {
      const validUrl = normalizeUrl(item.rawUrl);
      if (!validUrl) {
        continue;
      }

      const match = await scrapeHybrid(validUrl, selectors);
      if (match && match.text) {
        rowResults.set(item.rowIndex, match.text);
      }
    }

    // Verify rowResults contents
    expect(rowResults.size).toBe(3);
    expect(rowResults.get(2)).toBe("Wireless Noise-Canceling Headphones");
    expect(rowResults.get(3)).toBe("Mechanical Gaming Keyboard");
    expect(rowResults.get(4)).toBe("Ultra HD Smart Monitor");
    expect(rowResults.has(5)).toBe(false);
    expect(rowResults.has(6)).toBe(false);

    // 4. Enrich workbook with a new column using enrichExcelBuffer
    const enrichedBuffer = await enrichExcelBuffer({
      buffer: initialBuffer,
      sheetName: "Products",
      targetColumn: { mode: "new", colName: "Extracted_Title" },
      rowResults,
    });

    expect(enrichedBuffer).toBeDefined();
    expect(enrichedBuffer.length).toBeGreaterThan(0);

    // 5. Save to temp-store using saveTempFile
    const filename = "products_updated.xlsx";
    const downloadId = saveTempFile(enrichedBuffer, filename);
    expect(downloadId).toBeDefined();
    expect(typeof downloadId).toBe("string");

    // 6. Verify temp-store retrieval
    const retrieved = getTempFile(downloadId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.filename).toBe(filename);

    // 7. Verify enriched workbook contents
    const verifiedWorkbook = new ExcelJS.Workbook();
    await verifiedWorkbook.xlsx.load(retrieved!.buffer as unknown as ExcelJS.Buffer);

    const verifiedSheet = verifiedWorkbook.getWorksheet("Products");
    expect(verifiedSheet).toBeDefined();

    // Check header row
    const headerRow = verifiedSheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe("ID");
    expect(headerRow.getCell(2).value).toBe("Product Name");
    expect(headerRow.getCell(3).value).toBe("Product URL");
    expect(headerRow.getCell(4).value).toBe("Current Price");
    expect(headerRow.getCell(5).value).toBe("Extracted_Title");
    expect(headerRow.getCell(5).font?.bold).toBe(true);

    // Check Row 2 (Matched product 1)
    const row2 = verifiedSheet!.getRow(2);
    expect(row2.getCell(1).value).toBe(101);
    expect(row2.getCell(2).value).toBe("Headphones");
    expect(row2.getCell(3).value).toBe(`${baseUrl}/product-1`);
    expect(row2.getCell(4).value).toBe(199.99);
    expect(row2.getCell(5).value).toBe("Wireless Noise-Canceling Headphones");

    // Check Row 3 (Matched product 2)
    const row3 = verifiedSheet!.getRow(3);
    expect(row3.getCell(1).value).toBe(102);
    expect(row3.getCell(2).value).toBe("Keyboard");
    expect(row3.getCell(3).value).toBe(`${baseUrl}/product-2`);
    expect(row3.getCell(4).value).toBe(89.5);
    expect(row3.getCell(5).value).toBe("Mechanical Gaming Keyboard");

    // Check Row 4 (Matched product 3)
    const row4 = verifiedSheet!.getRow(4);
    expect(row4.getCell(1).value).toBe(103);
    expect(row4.getCell(2).value).toBe("Monitor");
    expect(row4.getCell(3).value).toBe(`${baseUrl}/product-3`);
    expect(row4.getCell(4).value).toBe(329.0);
    expect(row4.getCell(5).value).toBe("Ultra HD Smart Monitor");

    // Check Row 5 (Invalid URL - original data intact, new cell empty/null)
    const row5 = verifiedSheet!.getRow(5);
    expect(row5.getCell(1).value).toBe(104);
    expect(row5.getCell(2).value).toBe("Invalid URL Row");
    expect(row5.getCell(3).value).toBe("invalid://not-a-web-url");
    expect(row5.getCell(4).value).toBe(0);
    expect(row5.getCell(5).value).toBeNull();

    // Check Row 6 (Unprocessed - original data intact, new cell empty/null)
    const row6 = verifiedSheet!.getRow(6);
    expect(row6.getCell(1).value).toBe(105);
    expect(row6.getCell(2).value).toBe("Unprocessed Row");
    expect(row6.getCell(3).value).toBe("");
    expect(row6.getCell(4).value).toBe(50);
    expect(row6.getCell(5).value).toBeNull();
  });

  it("completes workflow with existing column target mode", async () => {
    // Test updating an existing column
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Updates");
    sheet.addRow(["ID", "URL", "Description"]);
    sheet.addRow([1, `${baseUrl}/product-1`, "Old description 1"]);
    sheet.addRow([2, `${baseUrl}/product-2`, "Old description 2"]);

    const initialBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rowResults = new Map<number, string>();
    const match1 = await scrapeHybrid(`${baseUrl}/product-1`, [".description"]);
    if (match1?.text) {
      rowResults.set(2, match1.text);
    }

    const enrichedBuffer = await enrichExcelBuffer({
      buffer: initialBuffer,
      sheetName: "Updates",
      targetColumn: { mode: "existing", colIndex: 3 },
      rowResults,
    });

    const verifiedWorkbook = new ExcelJS.Workbook();
    await verifiedWorkbook.xlsx.load(enrichedBuffer as unknown as ExcelJS.Buffer);
    const verifiedSheet = verifiedWorkbook.getWorksheet("Updates")!;

    expect(verifiedSheet.getRow(2).getCell(3).value).toBe(
      "Premium audio with active noise cancellation."
    );
    expect(verifiedSheet.getRow(3).getCell(3).value).toBe("Old description 2");
  });
});
