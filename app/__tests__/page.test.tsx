import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../page";

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

    // Step 2: Configuration
    expect(html).toContain("Bước 2: Cấu hình trích xuất dữ liệu");
    expect(html).toContain("1. Chọn Cột chứa URL");
    expect(html).toContain("2. Cột Đích để điền dữ liệu");
    expect(html).toContain("3. Danh sách CSS Selector");
    expect(html).toContain("Phạm vi dòng cần cào:");

    // Step 3: Execution & Results Dashboard
    expect(html).toContain("Bước 3: Tiến trình Cào dữ liệu");
    expect(html).toContain("Bắt đầu xử lý");
  });

  it("defaults to start button disabled before file upload and column selection", () => {
    const html = renderToStaticMarkup(<Home />);

    // Button should be disabled initially
    expect(html).toContain("disabled");
  });
});
