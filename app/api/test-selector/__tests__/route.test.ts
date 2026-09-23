import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import * as scraper from "@/lib/scraper";
import type { ExtractionFieldConfig } from "@/types/crawler";
import { POST } from "../route";

describe("POST /api/test-selector", () => {
  afterEach(() => {
    // Restore any spies after each test
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: "not a json string",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when selectors is missing or not an array", async () => {
    const req = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });

  it("returns 400 when selectors array is empty or contains only whitespace", async () => {
    const reqEmpty = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com", selectors: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const resEmpty = await POST(reqEmpty);
    expect(resEmpty.status).toBe(400);
    const jsonEmpty = await resEmpty.json();
    expect(jsonEmpty.success).toBe(false);

    const reqWhitespace = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com", selectors: ["  ", ""] }),
      headers: { "Content-Type": "application/json" },
    });

    const resWhitespace = await POST(reqWhitespace);
    expect(resWhitespace.status).toBe(400);
    const jsonWhitespace = await resWhitespace.json();
    expect(jsonWhitespace.success).toBe(false);
  });

  it("returns 400 when url is missing or invalid", async () => {
    const reqMissingUrl = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ selectors: [".title"] }),
      headers: { "Content-Type": "application/json" },
    });

    const resMissing = await POST(reqMissingUrl);
    expect(resMissing.status).toBe(400);
    const jsonMissing = await resMissing.json();
    expect(jsonMissing.success).toBe(false);

    const reqInvalidUrl = new NextRequest("http://localhost:3000/api/test-selector", {
      method: "POST",
      body: JSON.stringify({ url: "invalid-url-without-domain", selectors: [".title"] }),
      headers: { "Content-Type": "application/json" },
    });

    const resInvalid = await POST(reqInvalidUrl);
    expect(resInvalid.status).toBe(400);
    const jsonInvalid = await resInvalid.json();
    expect(jsonInvalid.success).toBe(false);
  });

  it("normalizes URL without protocol and returns 200 with match data when selector matches", async () => {
    const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockResolvedValue({
      selector: "h1.product-title",
      text: "Wireless Headphones",
      method: "static",
      durationMs: 45,
    });

    try {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: "example.com/products/123",
          selectors: ["  h1.product-title  ", ".description"],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.matchedSelector).toBe("h1.product-title");
      expect(json.textContent).toBe("Wireless Headphones");
      expect(json.method).toBe("static");
      expect(json.durationMs).toBe(45);

      expect(scrapeSpy).toHaveBeenCalledWith("https://example.com/products/123", [
        "h1.product-title",
        ".description",
      ]);
    } finally {
      scrapeSpy.mockRestore();
    }
  });

  it("returns 200 with specific error message when no selector matches", async () => {
    const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockResolvedValue(null);

    try {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          selectors: [".non-existent-selector"],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe(
        "Không tìm thấy nội dung nào khớp với danh sách selector trên trang web này."
      );
    } finally {
      scrapeSpy.mockRestore();
    }
  });

  it("returns 500 when scrapeHybrid throws an unexpected error", async () => {
    const scrapeSpy = spyOn(scraper, "scrapeHybrid").mockRejectedValue(
      new Error("Network connection reset")
    );

    try {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          selectors: [".title"],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Network connection reset");
    } finally {
      scrapeSpy.mockRestore();
    }
  });

  it("successfully tests selector against a live mock HTTP server", async () => {
    const server = Bun.serve({
      port: 3098,
      fetch(_req) {
        return new Response(
          `<!DOCTYPE html>
          <html>
            <body>
              <div id="target-element">Real Live Content From Server</div>
            </body>
          </html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      },
    });

    try {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: `http://localhost:${server.port}`,
          selectors: [".missing-selector", "#target-element"],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.matchedSelector).toBe("#target-element");
      expect(json.textContent).toBe("Real Live Content From Server");
      expect(json.method).toBe("static");
      expect(typeof json.durationMs).toBe("number");
    } finally {
      server.stop(true);
    }
  });

  describe("Multi-Field Support", () => {
    it("returns 400 when fields array is empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          fields: [],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it("returns 400 when fields is provided but url is invalid", async () => {
      const req = new NextRequest("http://localhost:3000/api/test-selector", {
        method: "POST",
        body: JSON.stringify({
          url: "invalid-url",
          fields: [
            {
              id: "f1",
              name: "Title",
              selectors: ["h1"],
              targetColumn: { mode: "new", colName: "Title" },
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("URL");
    });

    it("tests multiple fields concurrently against a URL when fields array is provided", async () => {
      const scrapeSpy = spyOn(scraper, "scrapeMultiField").mockResolvedValue({
        title_field: { text: "Sample Product Title", matchedSelector: "h1.product-title" },
        price_field: { text: "$49.99", matchedSelector: ".price" },
        desc_field: null,
      });

      try {
        const fields: ExtractionFieldConfig[] = [
          {
            id: "title_field",
            name: "Title",
            selectors: ["h1.product-title", "h1"],
            targetColumn: { mode: "new", colName: "Product Title" },
          },
          {
            id: "price_field",
            name: "Price",
            selectors: [".price"],
            targetColumn: { mode: "new", colName: "Price" },
          },
          {
            id: "desc_field",
            name: "Description",
            selectors: [".missing-desc"],
            targetColumn: { mode: "new", colName: "Desc" },
          },
        ];

        const req = new NextRequest("http://localhost:3000/api/test-selector", {
          method: "POST",
          body: JSON.stringify({
            url: "example.com/item/456",
            fields,
          }),
          headers: { "Content-Type": "application/json" },
        });

        const response = await POST(req);
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.results).toBeDefined();
        expect(json.results.title_field).toEqual({
          text: "Sample Product Title",
          matchedSelector: "h1.product-title",
        });
        expect(json.results.price_field).toEqual({
          text: "$49.99",
          matchedSelector: ".price",
        });
        expect(json.results.desc_field.text).toBe("");
        expect(json.results.desc_field.error).toBeDefined();

        expect(scrapeSpy).toHaveBeenCalledWith("https://example.com/item/456", [
          { id: "title_field", selectors: ["h1.product-title", "h1"] },
          { id: "price_field", selectors: [".price"] },
          { id: "desc_field", selectors: [".missing-desc"] },
        ]);
      } finally {
        scrapeSpy.mockRestore();
      }
    });

    it("passes preClickSelector to scrapeMultiField when provided in multi-field mode", async () => {
      const scrapeSpy = spyOn(scraper, "scrapeMultiField").mockResolvedValue({
        f1: { text: "Data after submit", matchedSelector: ".result" },
      });

      try {
        const req = new NextRequest("http://localhost:3000/api/test-selector", {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/form",
            fields: [{ id: "f1", selectors: [".result"] }],
            preClickSelector: 'button[type="submit"].btn.btn-primary',
          }),
          headers: { "Content-Type": "application/json" },
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);

        expect(scrapeSpy).toHaveBeenCalledWith(
          "https://example.com/form",
          [{ id: "f1", selectors: [".result"] }],
          { preClickSelector: 'button[type="submit"].btn.btn-primary' }
        );
      } finally {
        scrapeSpy.mockRestore();
      }
    });
  });
});
