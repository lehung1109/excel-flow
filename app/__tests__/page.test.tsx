import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../page";
import SelectorConfig from "@/components/SelectorConfig";

describe("Home Page Component (app/page.tsx)", () => {
  it("renders page title, description, and branding in header", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("Excel Web Scraper");
    expect(html).toContain("v1.0");
    expect(html).toContain(
      "Cào dữ liệu website tự động và điền trực tiếp vào file Excel"
    );
  });

  it("renders all three workflow steps: upload, config, and progress dashboard", () => {
    const html = renderToStaticMarkup(<Home />);

    // Step 1: Upload
    expect(html).toContain("Bước 1: Tải lên file Excel");
    expect(html).toContain("Kéo thả file Excel vào đây");

    // Step 2: Multi-Field Configuration & Neon DB
    expect(html).toContain("Bước 2: Cấu hình trích xuất dữ liệu");
    expect(html).toContain("1. Chọn Cột chứa URL");
    expect(html).toContain("2. Danh sách các trường cần bóc tách");
    expect(html).toContain("Trường 1");
    expect(html).toContain("Extracted_Content");
    expect(html).toContain("📌 Ghi chú:");
    expect(html).toContain("Hệ thống sẽ tự động tạo một cột mới có tiêu đề là");
    expect(html).toContain("+ Thêm trường cần lấy");
    expect(html).toContain("💾 Lưu cấu hình này");
    expect(html).toContain("-- Chọn cấu hình đã lưu --");
    expect(html).not.toContain("Mẫu nhanh:");
    expect(html).toContain("3. Danh sách CSS Selector");
    expect(html).toContain("Phạm vi dòng cần cào:");
    expect(html).toContain("Bỏ qua các cột/ô đã có dữ liệu");

    // Step 3: Execution & Results Dashboard
    expect(html).toContain("Bước 3: Tiến trình Cào dữ liệu");
    expect(html).toContain("Bắt đầu xử lý");
  });

  it("defaults to start button disabled before file upload and column selection", () => {
    const html = renderToStaticMarkup(<Home />);

    // Button should be disabled initially
    expect(html).toContain("disabled");
    expect(html).toContain("Chưa có dữ liệu xử lý");
  });

  it("renders multi-field defaults properly with zero quick presets", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("h1.product-title");
    expect(html).toContain("h1.entry-title");
    expect(html).not.toContain("itemprop='headline'");
  });

  it("renders Save Config Modal and displays error messages directly inside modal dialog", () => {
    const htmlWithModal = renderToStaticMarkup(
      <SelectorConfig
        columns={[{ index: 1, header: "URL" }]}
        totalRows={50}
        urlColIndex={1}
        onUrlColChange={() => {}}
        fields={[
          {
            id: "f1",
            name: "Field 1",
            selectors: ["h1"],
            targetColumn: { mode: "new", colName: "Title" },
          },
        ]}
        onFieldsChange={() => {}}
        rowRange={{ startRow: 2, endRow: 50 }}
        onRowRangeChange={() => {}}
        onTestRequested={() => {}}
        initialSaveModalOpen={true}
        initialModalError="Vui lòng nhập tên cấu hình."
      />
    );

    // Modal dialog title and content
    expect(htmlWithModal).toContain("Lưu cấu hình vào Database");
    expect(htmlWithModal).toContain("Lưu cấu hình gồm");
    expect(htmlWithModal).toContain("1 trường");

    // Modal error rendered inside modal
    expect(htmlWithModal).toContain("Vui lòng nhập tên cấu hình.");
    expect(htmlWithModal).toContain('role="alert"');
  });
});
