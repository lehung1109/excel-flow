import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FileUploadZone from "../FileUploadZone";
import SelectorConfig, { createDefaultField } from "../SelectorConfig";
import type { ExcelColumnInfo, ExtractionFieldConfig } from "@/types/crawler";

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

  const sampleFields: ExtractionFieldConfig[] = [
    {
      id: "field_1",
      name: "Tiêu đề sản phẩm",
      selectors: ["h1.product-title", "h1.entry-title"],
      targetColumn: { mode: "new", colName: "Tieu_De_SP" },
    },
    {
      id: "field_2",
      name: "Giá bán",
      selectors: [".price", ".product-price"],
      targetColumn: { mode: "existing", colIndex: 2 },
    },
  ];

  it("SelectorConfig renders multi-field manager and does NOT render quick presets", () => {
    const rowRange = { startRow: 2, endRow: 100 };

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={100}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={sampleFields}
        onFieldsChange={() => {}}
        rowRange={rowRange}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    // Header & URL Column
    expect(html).toContain("Bước 2: Cấu hình trích xuất dữ liệu");
    expect(html).toContain("Chọn Cột chứa URL");
    expect(html).toContain("Cột 3: Product URL");

    // Quick presets MUST NOT exist
    expect(html).not.toContain("Mẫu nhanh:");
    expect(html).not.toContain("Mẫu nhanh");
    expect(html).not.toContain("itemprop='headline'");

    // Multi-field cards render
    expect(html).toContain("Tiêu đề sản phẩm");
    expect(html).toContain("h1.product-title");
    expect(html).toContain("Giá bán");
    expect(html).toContain(".price");

    // Add field button
    expect(html).toContain("+ Thêm trường cần lấy");

    // Row range
    expect(html).toContain("Phạm vi dòng cần cào:");
    expect(html).toContain("Toàn bộ file (99 dòng)");

    // Test button
    expect(html).toContain("Test thử selector trên 1 URL mẫu");
  });

  it("renders informative Text Note callout when mode is new", () => {
    const singleField: ExtractionFieldConfig[] = [
      {
        id: "field_1",
        name: "Mô tả sản phẩm",
        selectors: ["article p"],
        targetColumn: { mode: "new", colName: "Mo_Ta_Chi_Tiet" },
      },
    ];

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={singleField}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("📌 Ghi chú:");
    expect(html).toContain("Hệ thống sẽ tự động tạo một cột mới có tiêu đề là");
    expect(html).toContain("Mo_Ta_Chi_Tiet");
    expect(html).toContain("ở cuối bảng tính Excel để điền nội dung bóc tách được của trường này.");
    expect(html).not.toContain("⚠️ Vui lòng nhập tên tiêu đề cho cột mới");
  });

  it("renders warning note when new column colName is empty", () => {
    const emptyNameField: ExtractionFieldConfig[] = [
      {
        id: "field_1",
        name: "Thông tin",
        selectors: [".info"],
        targetColumn: { mode: "new", colName: "" },
      },
    ];

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={emptyNameField}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("⚠️ Vui lòng nhập tên tiêu đề cho cột mới trước khi tiến hành cào.");
    expect(html).toContain("(chưa đặt tên)");
  });

  it("renders existing column mode dropdown when field targetColumn mode is existing", () => {
    const existingField: ExtractionFieldConfig[] = [
      {
        id: "f_existing",
        name: "Cập nhật tên",
        selectors: [".name"],
        targetColumn: { mode: "existing", colIndex: 2 },
      },
    ];

    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={null}
        onUrlColChange={() => {}}
        fields={existingField}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("Ghi đè Cột 2: Product Name");
    expect(html).not.toContain("📌 Ghi chú:");
  });

  it("renders Neon DB config manager toolbar with load dropdown and save button", () => {
    const html = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={sampleFields}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );

    expect(html).toContain("-- Chọn cấu hình đã lưu --");
    expect(html).toContain("Lưu cấu hình");
  });

  it("creates valid default field structure for appending new fields", () => {
    const newField = createDefaultField(3);
    expect(newField.id).toBeDefined();
    expect(newField.name).toBe("Trường 3");
    expect(newField.selectors).toEqual([]);
    expect(newField.targetColumn.mode).toBe("new");
    if (newField.targetColumn.mode === "new") {
      expect(newField.targetColumn.colName).toBe("Truong_3");
    }
  });

  it("renders multiple field cards dynamically as fields are added", () => {
    const field1: ExtractionFieldConfig = {
      id: "f1",
      name: "Tên SP",
      selectors: ["h1"],
      targetColumn: { mode: "new", colName: "Col1" },
    };

    const html1 = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={[field1]}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );
    expect(html1).toContain("Tên SP");
    expect(html1).not.toContain("Giá SP");

    const field2: ExtractionFieldConfig = {
      id: "f2",
      name: "Giá SP",
      selectors: [".price"],
      targetColumn: { mode: "new", colName: "Col2" },
    };

    const html2 = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={[field1, field2]}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
      />
    );
    expect(html2).toContain("Tên SP");
    expect(html2).toContain("Giá SP");
  });

  it("renders skipExistingData checkbox with default checked state and handles toggling", () => {
    const htmlChecked = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={sampleFields}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
        skipExistingData={true}
        onSkipExistingDataChange={() => {}}
      />
    );

    expect(htmlChecked).toContain("Bỏ qua các cột/ô đã có dữ liệu");
    expect(htmlChecked).toContain('type="checkbox"');
    expect(htmlChecked).toContain("checked");

    const htmlUnchecked = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={sampleFields}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
        skipExistingData={false}
        onSkipExistingDataChange={() => {}}
      />
    );

    expect(htmlUnchecked).toContain("Bỏ qua các cột/ô đã có dữ liệu");
    // When unchecked, it does not have the 'checked=""' attribute
    expect(htmlUnchecked).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("renders preClickSelector interaction section with toggle and input", () => {
    const htmlWithPreClick = renderToStaticMarkup(
      <SelectorConfig
        columns={sampleColumns}
        totalRows={50}
        urlColIndex={3}
        onUrlColChange={() => {}}
        fields={sampleFields}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
        preClickSelector={'button[type="submit"].btn.btn-primary'}
        onPreClickSelectorChange={() => {}}
      />
    );

    expect(htmlWithPreClick).toContain("Tương tác trước khi cào dữ liệu");
    expect(htmlWithPreClick).toContain("btn.btn-primary");
  });
});

