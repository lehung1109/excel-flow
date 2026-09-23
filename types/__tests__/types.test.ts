import { describe, expect, it } from "bun:test";
import "../crawler";
import type {
  CrawlJobSummary,
  CrawlProgressEvent,
  CrawlRowResult,
  CrawlStatus,
  ExcelColumnInfo,
  ExcelSheetSummary,
  ScrapeMethod,
  SelectorMatch,
  TargetColumnConfig,
} from "../crawler";

describe("Crawler Types", () => {
  it("validates SelectorMatch shape and ScrapeMethod", () => {
    const method: ScrapeMethod = "static";
    const match: SelectorMatch = {
      text: "Sample Title",
      selector: "h1",
      method,
      durationMs: 150,
    };
    expect(match.text).toBe("Sample Title");
    expect(match.selector).toBe("h1");
    expect(match.method).toBe("static");
    expect(match.durationMs).toBe(150);
  });

  it("validates TargetColumnConfig union", () => {
    const existingCol: TargetColumnConfig = { mode: "existing", colIndex: 2 };
    const newCol: TargetColumnConfig = { mode: "new", colName: "Title_Extracted" };
    expect(existingCol.mode).toBe("existing");
    expect(newCol.mode).toBe("new");
  });

  it("validates CrawlRowResult shape and statuses", () => {
    const sStatus: CrawlStatus = "success";
    const successRow: CrawlRowResult = {
      rowIndex: 2,
      url: "https://example.com/product",
      status: sStatus,
      matchedSelector: "h1.title",
      text: "Product Name",
    };
    const failedRow: CrawlRowResult = {
      rowIndex: 3,
      url: "https://example.com/missing",
      status: "failed",
      error: "404 Not Found",
    };
    const skippedRow: CrawlRowResult = {
      rowIndex: 4,
      url: "",
      status: "skipped",
    };

    expect(successRow.status).toBe("success");
    expect(failedRow.error).toBe("404 Not Found");
    expect(skippedRow.status).toBe("skipped");
  });

  it("validates ExcelSheetSummary and ExcelColumnInfo shapes", () => {
    const columns: ExcelColumnInfo[] = [
      { index: 1, header: "ID" },
      { index: 2, header: "URL" },
    ];
    const summary: ExcelSheetSummary = {
      name: "Sheet1",
      rowCount: 10,
      columns,
      sampleRows: [[1, "https://example.com"]],
    };

    expect(summary.name).toBe("Sheet1");
    expect(summary.columns.length).toBe(2);
    expect(summary.sampleRows[0][1]).toBe("https://example.com");
  });

  it("validates CrawlJobSummary shape", () => {
    const jobSummary: CrawlJobSummary = {
      total: 100,
      succeeded: 90,
      failed: 8,
      skipped: 2,
      durationMs: 45000,
    };
    expect(jobSummary.total).toBe(100);
    expect(jobSummary.succeeded).toBe(90);
    expect(jobSummary.failed).toBe(8);
    expect(jobSummary.skipped).toBe(2);
    expect(jobSummary.durationMs).toBe(45000);
  });

  it("validates CrawlProgressEvent union types", () => {
    const startEvent: CrawlProgressEvent = {
      type: "start",
      totalRows: 100,
    };
    const rowEvent: CrawlProgressEvent = {
      type: "row_progress",
      rowIndex: 5,
      url: "https://example.com",
      status: "success",
      matchedSelector: "h1",
      text: "Hello",
      progressPercent: 5,
      processedCount: 5,
      totalCount: 100,
      etaSeconds: 95,
    };
    const completeEvent: CrawlProgressEvent = {
      type: "complete",
      success: true,
      downloadId: "job-123",
      summary: {
        total: 100,
        succeeded: 100,
        failed: 0,
        skipped: 0,
        durationMs: 12000,
      },
    };
    const errorEvent: CrawlProgressEvent = {
      type: "error",
      message: "Processing failed",
    };

    expect(startEvent.type).toBe("start");
    expect(rowEvent.type).toBe("row_progress");
    expect(completeEvent.type).toBe("complete");
    expect(errorEvent.type).toBe("error");
  });
});
