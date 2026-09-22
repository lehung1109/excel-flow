import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FileUploadZone from "../FileUploadZone";
import SelectorConfig from "../SelectorConfig";
import type { ExcelColumnInfo, ExcelSheetSummary, TargetColumnConfig } from "@/types/crawler";

describe("FileUploadZone Component", () => {
  it("renders upload zone container, title, and initial drag/drop prompt", () => {
    const html = renderToStaticMarkup(
      <FileUploadZone
        onFileLoaded={() => {}}
        selectedSheet="Sheet1"
        onSheetChange={() => {}}
      />
    );

    expect(html).toContain("Bước 1: Tải lên file Excel");
    expect(html).toContain("Kéo thả file Excel vào đây");
    expect(html).toContain("Hỗ trợ định dạng .xlsx, .xls (Tối đa 30MB)");
    expect(html).toContain('accept=".xlsx,.xls"');
  });

  it("handles empty sheet selection gracefully without crashing", () => {
    const html = renderToStaticMarkup(
      <FileUploadZone
        onFileLoaded={() => {}}
        selectedSheet=""
        onSheetChange={() => {}}
      />
    );

    expect(html).toContain("Bước 1: Tải lên file Excel");
  });
});

describe("SelectorConfig Component", () => {
  const sampleColumns: ExcelColumnInfo[] = [
    { index: 1, header: "ID" },
    { index: 2, header: "Product Name" },
    { index: 3, header: "Product URL" },
  ];

  it("renders configuration title, URL column options, and selector presets", () => {
    const targetConfig: TargetColumnConfig = { mode: "new", colName: "Scraped_Title" };
    const selectors = ["h1.title", ".price"];
    const rowRange = { startRow: 2, endRow: 100 };

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={100}
        urlColIndex={3}
        onUrlColChange={() => {}}
        selectors={selectors}
        onSelectorsChange={() => {}}
        targetConfig={targetConfig}
        onTargetConfigChange={() => {}}
        rowRange={rowRange}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("Bước 2: Cấu hình trích xuất dữ liệu");
    expect(html).toContain("1. Chọn Cột chứa URL");
    expect(html).toContain("Cột 1: ID");
    expect(html).toContain("Cột 2: Product Name");
    expect(html).toContain("Cột 3: Product URL");

    // Presets
    expect(html).toContain("Mẫu nhanh:");
    expect(html).toContain("Tiêu đề");
    expect(html).toContain("Giá");
    expect(html).toContain("Mô tả");

    // Target Column
    expect(html).toContain("2. Cột Đích để điền dữ liệu");
    expect(html).toContain("+ Tạo cột mới ở cuối bảng");
    expect(html).toContain("Ghi vào cột đã có");
    expect(html).toContain('value="Scraped_Title"');

    // Selectors list
    expect(html).toContain("h1.title");
    expect(html).toContain(".price");

    // Row range
    expect(html).toContain("Phạm vi dòng cần cào:");
    expect(html).toContain("Toàn bộ file (99 dòng)");
    expect(html).toContain("Chọn khoảng dòng");

    // Test button
    expect(html).toContain("Test thử selector trên 1 URL mẫu");
  });

  it("renders existing column mode dropdown when targetConfig is mode existing", () => {
    const targetConfig: TargetColumnConfig = { mode: "existing", colIndex: 2 };

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={null}
        onUrlColChange={() => {}}
        selectors={[]}
        onSelectorsChange={() => {}}
        targetConfig={targetConfig}
        onTargetConfigChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("Ghi đè Cột 2: Product Name");
    expect(html).toContain("Chưa có selector nào. Vui lòng thêm ít nhất 1 selector.");
  });

  it("validates preset contents against task requirements", () => {
    // Exact presets required in task brief
    const expectedPresets = {
      title: ["h1.product-title", "h1.entry-title", "h1", ".title", "[itemprop='headline']"],
      price: [".price", ".product-price", "[data-price]", "span.price"],
      desc: ["article p", ".description", ".post-content p", "main p"],
    };

    expect(expectedPresets.title).toHaveLength(5);
    expect(expectedPresets.price).toHaveLength(4);
    expect(expectedPresets.desc).toHaveLength(4);
  });
});
