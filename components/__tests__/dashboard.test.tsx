import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestSelectorModal from "../TestSelectorModal";
import LiveProgressDashboard from "../LiveProgressDashboard";
import type { CrawlJobSummary, CrawlRowResult, ExtractionFieldConfig } from "@/types/crawler";

describe("TestSelectorModal Component", () => {
  it("renders null when isOpen is false", () => {
    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={false}
        onClose={() => {}}
        sampleUrl="https://example.com/item-1"
        selectors={["h1.title"]}
      />
    );

    expect(html).toBe("");
  });

  it("renders modal dialog, sample URL input, selector list, and test button when isOpen is true", () => {
    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com/product/123"
        selectors={["h1.product-title", ".price", "main p"]}
      />
    );

    // Title and close
    expect(html).toContain("Kiểm tra Thử Selector trên URL Mẫu");
    expect(html).toContain('aria-label="Đóng"');

    // Sample URL input
    expect(html).toContain("URL mẫu để kiểm tra");
    expect(html).toContain('value="https://example.com/product/123"');

    // Selectors list
    expect(html).toContain("Danh sách Selector (3)");
    expect(html).toContain("h1.product-title");
    expect(html).toContain(".price");
    expect(html).toContain("main p");

    // Action button
    expect(html).toContain("Bắt đầu Test Thử");
  });

  it("renders alert when selectors list is empty", () => {
    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com"
        selectors={[]}
      />
    );

    expect(html).toContain("Chưa có selector nào được cấu hình");
    // Button should be disabled
    expect(html).toContain("disabled");
  });

  it("renders configured fields when fields prop is provided", () => {
    const sampleFields: ExtractionFieldConfig[] = [
      {
        id: "f_title",
        name: "Tiêu đề SP",
        selectors: ["h1.product-title", "h1"],
        targetColumn: { mode: "new", colName: "TieuDe" },
      },
      {
        id: "f_price",
        name: "Giá bán",
        selectors: [".price", ".amount"],
        targetColumn: { mode: "existing", colIndex: 2 },
      },
    ];

    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com/product/123"
        fields={sampleFields}
      />
    );

    // Shows field count & names
    expect(html).toContain("Danh sách trường bóc tách (2)");
    expect(html).toContain("Tiêu đề SP");
    expect(html).toContain("Giá bán");
    expect(html).toContain("h1.product-title");
    expect(html).toContain(".price");
    expect(html).toContain("Bắt đầu Test Thử");
  });

  it("renders alert when fields list is empty", () => {
    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com"
        fields={[]}
      />
    );

    expect(html).toContain("Chưa có trường nào được cấu hình");
    expect(html).toContain("disabled");
  });

  it("renders multi-field preview results table with field names, matched selectors, and extracted text", () => {
    const sampleFields: ExtractionFieldConfig[] = [
      {
        id: "f_title",
        name: "Tiêu đề SP",
        selectors: ["h1.product-title"],
        targetColumn: { mode: "new", colName: "TieuDe" },
      },
      {
        id: "f_price",
        name: "Giá bán",
        selectors: [".price"],
        targetColumn: { mode: "existing", colIndex: 2 },
      },
    ];

    const initialResult = {
      success: true,
      fieldResults: {
        f_title: {
          text: "iPhone 16 Pro Max 256GB",
          matchedSelector: "h1.product-title",
        },
        f_price: {
          text: "",
          error: "Không tìm thấy nội dung nào khớp",
        },
      },
    };

    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com/p1"
        fields={sampleFields}
        initialResult={initialResult}
      />
    );

    // Table headers
    expect(html).toContain("Tên trường");
    expect(html).toContain("Selector khớp");
    expect(html).toContain("Nội dung bóc tách");

    // Row 1 (matched)
    expect(html).toContain("Tiêu đề SP");
    expect(html).toContain("h1.product-title");
    expect(html).toContain("iPhone 16 Pro Max 256GB");

    // Row 2 (unmatched / error)
    expect(html).toContain("Giá bán");
    expect(html).toContain("Không tìm thấy nội dung nào khớp");
  });

  it("renders preClickSelector badge when preClickSelector prop is provided", () => {
    const html = renderToStaticMarkup(
      <TestSelectorModal
        isOpen={true}
        onClose={() => {}}
        sampleUrl="https://example.com/product/123"
        selectors={["h1.product-title"]}
        preClickSelector={'button[type="submit"].btn.btn-primary'}
      />
    );

    expect(html).toContain("Click trước khi cào");
    expect(html).toContain("btn.btn-primary");
  });
});

describe("LiveProgressDashboard Component", () => {
  const dummyLogs: CrawlRowResult[] = [
    {
      rowIndex: 2,
      url: "https://shop.example.com/p/1",
      status: "success",
      matchedSelector: "h1.title",
      text: "Laptop Pro Max 2026",
    },
    {
      rowIndex: 3,
      url: "https://shop.example.com/p/2",
      status: "failed",
      error: "404 Not Found",
    },
    {
      rowIndex: 4,
      url: "invalid-url",
      status: "skipped",
      error: "URL không hợp lệ",
    },
  ];

  it("renders start button with disabled state when canStart is false", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={0}
        processedCount={0}
        totalCount={50}
        etaSeconds={0}
        logs={[]}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={false}
      />
    );

    expect(html).toContain("Bắt đầu xử lý");
    expect(html).toContain("disabled");
    // Abort and Download buttons should not be rendered
    expect(html).not.toContain("Dừng lại");
    expect(html).not.toContain("Tải file Excel kết quả (.xlsx)");
  });

  it("renders start button enabled when canStart is true and not running", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={0}
        processedCount={0}
        totalCount={50}
        etaSeconds={0}
        logs={[]}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    expect(html).toContain("Bắt đầu xử lý");
    expect(html).not.toContain('disabled=""');
  });

  it("renders abort button ('Dừng lại') when isRunning is true", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={true}
        progressPercent={40}
        processedCount={20}
        totalCount={50}
        etaSeconds={30}
        logs={dummyLogs}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    expect(html).toContain("Dừng lại");
    expect(html).toContain("Đang cào dữ liệu...");
  });

  it("renders download button when downloadId is provided", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={100}
        processedCount={50}
        totalCount={50}
        etaSeconds={0}
        logs={dummyLogs}
        summary={{
          total: 50,
          succeeded: 45,
          failed: 3,
          skipped: 2,
          durationMs: 4200,
        }}
        downloadId="abc-123-uuid"
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    expect(html).toContain("Tải file Excel kết quả (.xlsx)");
    expect(html).toContain('href="/api/download/abc-123-uuid"');
  });

  it("renders progress bar with % completion and ETA display", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={true}
        progressPercent={65}
        processedCount={65}
        totalCount={100}
        etaSeconds={75} // 1m 15s
        logs={dummyLogs}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    expect(html).toContain("65%");
    expect(html).toContain("(65 / 100 URL)");
    expect(html).toContain("Thời gian còn lại (ETA): ~1m 15s");
    expect(html).toContain('style="width:65%"');
  });

  it("renders 4 metric counter cards with correct counts", () => {
    const summary: CrawlJobSummary = {
      total: 100,
      succeeded: 80,
      failed: 15,
      skipped: 5,
      durationMs: 12000,
    };

    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={100}
        processedCount={100}
        totalCount={100}
        etaSeconds={0}
        logs={dummyLogs}
        summary={summary}
        downloadId="test-id"
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    // 4 metric cards
    expect(html).toContain("Tổng số URL");
    expect(html).toContain("100");

    expect(html).toContain("Thành công");
    expect(html).toContain("80");

    expect(html).toContain("Thất bại");
    expect(html).toContain("15");

    expect(html).toContain("Bỏ qua/Trống");
    expect(html).toContain("5");
  });

  it("calculates metrics from logs when summary is null", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={true}
        progressPercent={30}
        processedCount={3}
        totalCount={10}
        etaSeconds={15}
        logs={dummyLogs} // 1 success, 1 failed, 1 skipped
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    expect(html).toContain("Tổng số URL");
    expect(html).toContain("10"); // totalCount

    expect(html).toContain("Thành công");
    expect(html).toContain("Thất bại");
    expect(html).toContain("Bỏ qua/Trống");
  });

  it("renders real-time log table with row index, status, url, selector, and text/error", () => {
    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={true}
        progressPercent={30}
        processedCount={3}
        totalCount={10}
        etaSeconds={15}
        logs={dummyLogs}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    // Table headers
    expect(html).toContain("Dòng");
    expect(html).toContain("Trạng thái");
    expect(html).toContain("URL");
    expect(html).toContain("Selector khớp");
    expect(html).toContain("Nội dung / Lỗi");

    // Row contents
    expect(html).toContain("#2");
    expect(html).toContain("https://shop.example.com/p/1");
    expect(html).toContain("h1.title");
    expect(html).toContain("Laptop Pro Max 2026");

    expect(html).toContain("#3");
    expect(html).toContain("https://shop.example.com/p/2");
    expect(html).toContain("404 Not Found");

    expect(html).toContain("#4");
    expect(html).toContain("invalid-url");
    expect(html).toContain("URL không hợp lệ");
  });

  it("caps log table display to at most 100 most recent rows", () => {
    const lotsOfLogs: CrawlRowResult[] = Array.from({ length: 150 }, (_, i) => ({
      rowIndex: i + 2,
      url: `https://example.com/page/${i}`,
      status: "success",
      matchedSelector: "h1",
      text: `Title ${i}`,
    }));

    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={100}
        processedCount={150}
        totalCount={150}
        etaSeconds={0}
        logs={lotsOfLogs}
        summary={null}
        downloadId={null}
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    // Should indicate 100 dòng gần nhất
    expect(html).toContain("100 dòng gần nhất");
    // Row 151 (index 149) should be present
    expect(html).toContain("#151");
    // Row 2 (the first item, oldest) should not be present in the 100 most recent rows (which start from index 50: row 52)
    expect(html).not.toContain("#2<");
  });

  it("renders row results with multi-field badges/pills in the log table", () => {
    const multiLogs = [
      {
        rowIndex: 2,
        url: "https://shop.example.com/p/1",
        status: "success" as const,
        fieldResults: {
          "Tiêu đề": {
            text: "iPhone 16 Pro Max",
            matchedSelector: "h1.title",
          },
          "Giá": {
            text: "34.990.000đ",
            matchedSelector: ".price",
          },
        },
      },
      {
        rowIndex: 3,
        url: "https://shop.example.com/p/2",
        status: "failed" as const,
        error: "Không tìm thấy selector nào khớp",
        fieldResults: {
          "Tiêu đề": {
            text: "",
            error: "Không tìm thấy selector nào khớp",
          },
          "Giá": {
            text: "",
            error: "Không tìm thấy selector nào khớp",
          },
        },
      },
    ];

    const html = renderToStaticMarkup(
      <LiveProgressDashboard
        isRunning={false}
        progressPercent={100}
        processedCount={2}
        totalCount={2}
        etaSeconds={0}
        logs={multiLogs}
        summary={null}
        downloadId="multi-test"
        onStart={() => {}}
        onAbort={() => {}}
        canStart={true}
      />
    );

    // Multi-field pills with field names & values
    expect(html).toContain("Tiêu đề:");
    expect(html).toContain("iPhone 16 Pro Max");
    expect(html).toContain("Giá:");
    expect(html).toContain("34.990.000đ");

    // Row 3 error representation
    expect(html).toContain("Không tìm thấy selector nào khớp");
  });
});
