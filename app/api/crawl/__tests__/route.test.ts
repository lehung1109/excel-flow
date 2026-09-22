import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import * as scraper from "@/lib/scraper";
import { clearTempStore, getTempFile } from "@/lib/temp-store";
import { POST } from "../route";

function parseSseEvents(raw: string): Array<{ event: string; data: any }> {
  return raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      let event = "message";
      let dataStr = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) {
          event = line.slice("event: ".length).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice("data: ".length).trim();
        }
      }
      return { event, data: JSON.parse(dataStr) };
    });
}

async function createTestExcelFile(
  sheetName = "Sheet1",
  rows: (string | number | null)[][] = [
    ["ID", "Product Name", "Product URL"],
    [1, "Wireless Mouse", "https://example.com/mouse"],
    [2, "Mechanical Keyboard", "https://example.com/keyboard"],
  ]
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  for (const row of rows) {
    worksheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], "test_products.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("POST /api/crawl", () => {
  beforeEach(() => {
    clearTempStore();
  });

  afterEach(() => {
    // Spies are cleaned up in individual tests or restored
  });

  describe("Validation", () => {
    it("returns 400 when file is missing", async () => {
      const formData = new FormData();
      formData.append("sheetName", "Sheet1");
      formData.append("urlColIndex", "3");
      formData.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      formData.append("selectors", JSON.stringify(["h1"]));

      const req = new NextRequest("http://localhost:3000/api/crawl", {
        method: "POST",
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it("returns 400 when urlColIndex is missing or invalid", async () => {
      const file = await createTestExcelFile();

      // Missing urlColIndex
      const fdMissing = new FormData();
      fdMissing.append("file", file);
      fdMissing.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fdMissing.append("selectors", JSON.stringify(["h1"]));

      const resMissing = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdMissing,
        })
      );
      expect(resMissing.status).toBe(400);

      // Invalid urlColIndex
      const fdInvalid = new FormData();
      fdInvalid.append("file", file);
      fdInvalid.append("urlColIndex", "not-a-number");
      fdInvalid.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fdInvalid.append("selectors", JSON.stringify(["h1"]));

      const resInvalid = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdInvalid,
        })
      );
      expect(resInvalid.status).toBe(400);

      // Negative/zero urlColIndex
      const fdZero = new FormData();
      fdZero.append("file", file);
      fdZero.append("urlColIndex", "0");
      fdZero.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fdZero.append("selectors", JSON.stringify(["h1"]));

      const resZero = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdZero,
        })
      );
      expect(resZero.status).toBe(400);
    });

    it("returns 400 when targetColumnConfig is missing or invalid JSON/schema", async () => {
      const file = await createTestExcelFile();

      // Missing targetColumnConfig
      const fdMissing = new FormData();
      fdMissing.append("file", file);
      fdMissing.append("urlColIndex", "3");
      fdMissing.append("selectors", JSON.stringify(["h1"]));

      const resMissing = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdMissing,
        })
      );
      expect(resMissing.status).toBe(400);

      // Invalid JSON
      const fdBadJson = new FormData();
      fdBadJson.append("file", file);
      fdBadJson.append("urlColIndex", "3");
      fdBadJson.append("targetColumnConfig", "not-json");
      fdBadJson.append("selectors", JSON.stringify(["h1"]));

      const resBadJson = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdBadJson,
        })
      );
      expect(resBadJson.status).toBe(400);

      // Invalid mode
      const fdBadMode = new FormData();
      fdBadMode.append("file", file);
      fdBadMode.append("urlColIndex", "3");
      fdBadMode.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "invalid-mode", colName: "Title" })
      );
      fdBadMode.append("selectors", JSON.stringify(["h1"]));

      const resBadMode = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdBadMode,
        })
      );
      expect(resBadMode.status).toBe(400);
    });

    it("returns 400 when selectors is missing, invalid JSON, or empty", async () => {
      const file = await createTestExcelFile();

      // Missing selectors
      const fdMissing = new FormData();
      fdMissing.append("file", file);
      fdMissing.append("urlColIndex", "3");
      fdMissing.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );

      const resMissing = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdMissing,
        })
      );
      expect(resMissing.status).toBe(400);

      // Empty selectors array
      const fdEmpty = new FormData();
      fdEmpty.append("file", file);
      fdEmpty.append("urlColIndex", "3");
      fdEmpty.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fdEmpty.append("selectors", JSON.stringify([]));

      const resEmpty = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdEmpty,
        })
      );
      expect(resEmpty.status).toBe(400);

      // Selectors with only blank strings
      const fdBlank = new FormData();
      fdBlank.append("file", file);
      fdBlank.append("urlColIndex", "3");
      fdBlank.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fdBlank.append("selectors", JSON.stringify(["   ", ""]));

      const resBlank = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fdBlank,
        })
      );
      expect(resBlank.status).toBe(400);
    });

    it("returns 400 when rowRange has invalid JSON", async () => {
      const file = await createTestExcelFile();

      const fd = new FormData();
      fd.append("file", file);
      fd.append("urlColIndex", "3");
      fd.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fd.append("selectors", JSON.stringify(["h1"]));
      fd.append("rowRange", "bad-row-range-json");

      const res = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fd,
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when file content is not a valid Excel workbook", async () => {
      const corruptFile = new File([Buffer.from("invalid excel binary data")], "corrupt.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fd = new FormData();
      fd.append("file", corruptFile);
      fd.append("urlColIndex", "3");
      fd.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fd.append("selectors", JSON.stringify(["h1"]));

      const res = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fd,
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when specified sheet does not exist in workbook", async () => {
      const file = await createTestExcelFile("ActualSheet");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("sheetName", "NonExistentSheet");
      fd.append("urlColIndex", "3");
      fd.append(
        "targetColumnConfig",
        JSON.stringify({ mode: "new", colName: "Title" })
      );
      fd.append("selectors", JSON.stringify(["h1"]));

      const res = await POST(
        new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: fd,
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("NonExistentSheet");
    });
  });

  describe("SSE Streaming & Concurrency", () => {
    it("sets correct SSE headers and streams events for successful crawl with new column", async () => {
      const file = await createTestExcelFile("Products", [
        ["ID", "Name", "URL"],
        [1, "Product A", "https://example.com/prod-a"],
        [2, "Product B", "https://example.com/prod-b"],
      ]);

      const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockImplementation(async (url) => {
        if (url.includes("prod-a")) {
          return { selector: "h1.prod-title", text: "Brand A Premium", method: "static" };
        }
        if (url.includes("prod-b")) {
          return { selector: "h1.prod-title", text: "Brand B Standard", method: "static" };
        }
        return null;
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sheetName", "Products");
        formData.append("urlColIndex", "3");
        formData.append(
          "targetColumnConfig",
          JSON.stringify({ mode: "new", colName: "Extracted_Title" })
        );
        formData.append("selectors", JSON.stringify(["h1.prod-title"]));

        const req = new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: formData,
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        // Check SSE response headers
        expect(res.headers.get("Content-Type")).toContain("text/event-stream");
        expect(res.headers.get("Cache-Control")).toContain("no-cache");

        // Read stream body
        const rawBody = await res.text();
        const events = parseSseEvents(rawBody);

        // Verify start event
        const startEvent = events.find((e) => e.event === "start");
        expect(startEvent).toBeDefined();
        expect(startEvent?.data.totalRows).toBe(2);

        // Verify row_progress events
        const rowEvents = events.filter((e) => e.event === "row_progress");
        expect(rowEvents.length).toBe(2);

        const row2 = rowEvents.find((e) => e.data.rowIndex === 2);
        expect(row2?.data.status).toBe("success");
        expect(row2?.data.text).toBe("Brand A Premium");
        expect(row2?.data.matchedSelector).toBe("h1.prod-title");

        const row3 = rowEvents.find((e) => e.data.rowIndex === 3);
        expect(row3?.data.status).toBe("success");
        expect(row3?.data.text).toBe("Brand B Standard");

        // Verify complete event
        const completeEvent = events.find((e) => e.event === "complete");
        expect(completeEvent).toBeDefined();
        expect(completeEvent?.data.success).toBe(true);
        expect(completeEvent?.data.downloadId).toBeDefined();
        expect(completeEvent?.data.summary).toMatchObject({
          total: 2,
          succeeded: 2,
          failed: 0,
          skipped: 0,
        });

        // Verify file in tempStore
        const downloadId = completeEvent?.data.downloadId;
        const stored = getTempFile(downloadId);
        expect(stored).not.toBeNull();
        expect(stored?.filename).toBe("test_products_updated.xlsx");

        // Inspect updated workbook
        const resultWb = new ExcelJS.Workbook();
        await resultWb.xlsx.load(stored!.buffer as unknown as ExcelJS.Buffer);
        const resultWs = resultWb.getWorksheet("Products");
        expect(resultWs).toBeDefined();
        expect(resultWs?.getRow(1).getCell(4).value).toBe("Extracted_Title");
        expect(resultWs?.getRow(2).getCell(4).value).toBe("Brand A Premium");
        expect(resultWs?.getRow(3).getCell(4).value).toBe("Brand B Standard");
      } finally {
        scrapeSpy.mockRestore();
      }
    });

    it("handles skipped (invalid URL), failed (no match / error), and existing target column", async () => {
      const file = await createTestExcelFile("Sheet1", [
        ["ID", "URL", "ExistingTarget"],
        [1, "not an url", ""],
        [2, "https://example.com/no-match", ""],
        [3, "https://example.com/will-throw", ""],
        [4, "https://example.com/ok", ""],
      ]);

      const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockImplementation(async (url) => {
        if (url.includes("no-match")) {
          return null; // no selector match
        }
        if (url.includes("will-throw")) {
          throw new Error("Connection timed out");
        }
        if (url.includes("ok")) {
          return { selector: "h2", text: "Found Header", method: "browser" };
        }
        return null;
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        // sheetName omitted: should default to "Sheet1"
        formData.append("urlColIndex", "2");
        formData.append(
          "targetColumnConfig",
          JSON.stringify({ mode: "existing", colIndex: 3 })
        );
        formData.append("selectors", JSON.stringify(["h2"]));

        const req = new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: formData,
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const rawBody = await res.text();
        const events = parseSseEvents(rawBody);

        const completeEvent = events.find((e) => e.event === "complete");
        expect(completeEvent).toBeDefined();
        expect(completeEvent?.data.summary).toMatchObject({
          total: 4,
          succeeded: 1,
          failed: 2,
          skipped: 1,
        });

        // Check individual row_progress events
        const row2 = events.find((e) => e.event === "row_progress" && e.data.rowIndex === 2);
        expect(row2?.data.status).toBe("skipped");

        const row3 = events.find((e) => e.event === "row_progress" && e.data.rowIndex === 3);
        expect(row3?.data.status).toBe("failed");
        expect(row3?.data.error).toBeDefined();

        const row4 = events.find((e) => e.event === "row_progress" && e.data.rowIndex === 4);
        expect(row4?.data.status).toBe("failed");
        expect(row4?.data.error).toContain("Connection timed out");

        const row5 = events.find((e) => e.event === "row_progress" && e.data.rowIndex === 5);
        expect(row5?.data.status).toBe("success");
        expect(row5?.data.text).toBe("Found Header");

        // Verify updated existing column
        const stored = getTempFile(completeEvent?.data.downloadId);
        expect(stored).not.toBeNull();
        const resultWb = new ExcelJS.Workbook();
        await resultWb.xlsx.load(stored!.buffer as unknown as ExcelJS.Buffer);
        const resultWs = resultWb.getWorksheet("Sheet1");
        expect(resultWs?.getRow(5).getCell(3).value).toBe("Found Header");
      } finally {
        scrapeSpy.mockRestore();
      }
    });

    it("respects rowRange parameters to crawl only specified subset of rows", async () => {
      const file = await createTestExcelFile("Sheet1", [
        ["ID", "URL"],
        [1, "https://example.com/1"],
        [2, "https://example.com/2"],
        [3, "https://example.com/3"],
        [4, "https://example.com/4"],
      ]);

      const crawledUrls: string[] = [];
      const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockImplementation(async (url) => {
        crawledUrls.push(url);
        return { selector: "p", text: "Text", method: "static" };
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("urlColIndex", "2");
        formData.append(
          "targetColumnConfig",
          JSON.stringify({ mode: "new", colName: "Output" })
        );
        formData.append("selectors", JSON.stringify(["p"]));
        formData.append("rowRange", JSON.stringify({ startRow: 3, endRow: 4 }));

        const req = new NextRequest("http://localhost:3000/api/crawl", {
          method: "POST",
          body: formData,
        });

        const res = await POST(req);
        const rawBody = await res.text();
        const events = parseSseEvents(rawBody);

        const startEvent = events.find((e) => e.event === "start");
        expect(startEvent?.data.totalRows).toBe(2);

        const rowEvents = events.filter((e) => e.event === "row_progress");
        expect(rowEvents.map((r) => r.data.rowIndex).sort()).toEqual([3, 4]);

        expect(crawledUrls).toEqual(["https://example.com/2", "https://example.com/3"]);
      } finally {
        scrapeSpy.mockRestore();
      }
    });
  });
});
