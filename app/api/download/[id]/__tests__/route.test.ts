import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { clearTempStore, saveTempFile } from "@/lib/temp-store";
import { GET } from "../route";

describe("GET /api/download/[id]", () => {
  beforeEach(() => {
    clearTempStore?.();
  });

  afterEach(() => {
    clearTempStore?.();
  });

  it("returns 404 when download ID does not exist", async () => {
    const req = new NextRequest("http://localhost:3000/api/download/non-existent-id");
    const params = Promise.resolve({ id: "non-existent-id" });

    const response = await GET(req, { params });
    expect(response.status).toBe(404);
  });

  it("returns 404 when file has expired", async () => {
    const baseTime = 1000000000000;
    const dateSpy = spyOn(Date, "now").mockReturnValue(baseTime);

    try {
      const buffer = Buffer.from("expired content");
      const id = saveTempFile(buffer, "test.xlsx");

      // Advance time past 1 hour TTL
      dateSpy.mockReturnValue(baseTime + 60 * 60 * 1000 + 10);

      const req = new NextRequest(`http://localhost:3000/api/download/${id}`);
      const params = Promise.resolve({ id });

      const response = await GET(req, { params });
      expect(response.status).toBe(404);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("returns 200 with the file buffer and correct headers when file exists", async () => {
    const content = "col1,col2\nval1,val2";
    const buffer = Buffer.from(content);
    const filename = "export-results.xlsx";
    const id = saveTempFile(buffer, filename);

    const req = new NextRequest(`http://localhost:3000/api/download/${id}`);
    const params = Promise.resolve({ id });

    const response = await GET(req, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    expect(response.headers.get("Content-Length")).toBe(buffer.length.toString());

    const responseArrayBuffer = await response.arrayBuffer();
    const responseBuffer = Buffer.from(responseArrayBuffer);
    expect(responseBuffer.toString()).toBe(content);
  });

  it("encodes Unicode filenames properly in Content-Disposition header", async () => {
    const buffer = Buffer.from("unicode data");
    const filename = "báo cáo crawl 2026.xlsx";
    const id = saveTempFile(buffer, filename);

    const req = new NextRequest(`http://localhost:3000/api/download/${id}`);
    const params = Promise.resolve({ id });

    const response = await GET(req, { params });

    expect(response.status).toBe(200);
    const encoded = encodeURIComponent(filename);
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`
    );
  });
});
