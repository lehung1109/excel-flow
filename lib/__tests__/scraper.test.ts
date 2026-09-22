import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import * as scraper from "../scraper";
import { closeBrowser, scrapeBrowserMulti, scrapeHybrid, scrapeMultiField, scrapeStatic } from "../scraper";

describe("scraper", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  beforeAll(() => {
    server = Bun.serve({
      port: 3099,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/sample-page") {
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Test Page</title></head>
              <body>
                <h1 class="main-title">  Item Title &amp; Details &nbsp; </h1>
                <div class="empty-block">   </div>
                <div class="content-box">
                  <p class="description">Detailed product description here.</p>
                  <span class="price">$99.99</span>
                </div>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        if (url.pathname === "/empty-page") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <body>
                <div class="empty-div"></div>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        if (url.pathname === "/dynamic-text-page") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <body>
                <div class="product-banner">Return trend cotton product &amp; notes</div>
                <span class="discount-rate">45% off storewide</span>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }

        if (url.pathname === "/not-found") {
          return new Response("Not Found", { status: 404 });
        }

        return new Response("Default", { status: 200 });
      },
    });

    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    server.stop(true);
    await closeBrowser();
  });

  describe("scrapeStatic", () => {
    it("matches first valid selector and sanitizes text", async () => {
      const match = await scrapeStatic(`${baseUrl}/sample-page`, [
        ".main-title",
        ".description",
      ]);

      expect(match).not.toBeNull();
      expect(match?.text).toBe("Item Title & Details");
      expect(match?.selector).toBe(".main-title");
      expect(match?.method).toBe("static");
      expect(match?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("evaluates selectors in priority order and skips non-matching ones", async () => {
      const match = await scrapeStatic(`${baseUrl}/sample-page`, [
        ".non-existent-1",
        ".non-existent-2",
        ".price",
        ".description",
      ]);

      expect(match).not.toBeNull();
      expect(match?.text).toBe("$99.99");
      expect(match?.selector).toBe(".price");
      expect(match?.method).toBe("static");
    });

    it("skips selectors whose matched element has empty text", async () => {
      const match = await scrapeStatic(`${baseUrl}/sample-page`, [
        ".empty-block",
        ".price",
      ]);

      expect(match).not.toBeNull();
      expect(match?.text).toBe("$99.99");
      expect(match?.selector).toBe(".price");
    });

    it("ignores invalid selector syntax and continues searching", async () => {
      const match = await scrapeStatic(`${baseUrl}/sample-page`, [
        ":::invalid-pseudo[[[",
        "div[unclosed=",
        ".description",
      ]);

      expect(match).not.toBeNull();
      expect(match?.text).toBe("Detailed product description here.");
      expect(match?.selector).toBe(".description");
    });

    it("returns null when no selector matches", async () => {
      const match = await scrapeStatic(`${baseUrl}/sample-page`, [
        ".non-existent-selector",
        "#missing-id",
      ]);

      expect(match).toBeNull();
    });

    it("returns null on empty page when selectors only match empty elements", async () => {
      const match = await scrapeStatic(`${baseUrl}/empty-page`, [
        ".empty-div",
      ]);

      expect(match).toBeNull();
    });

    it("returns null on 404 response", async () => {
      const match = await scrapeStatic(`${baseUrl}/not-found`, [
        "h1",
        "body",
      ]);

      expect(match).toBeNull();
    });
  });

  describe("scrapeHybrid", () => {
    it("works against static page and returns static method", async () => {
      const match = await scrapeHybrid(`${baseUrl}/sample-page`, [
        ".description",
      ]);

      expect(match).not.toBeNull();
      expect(match?.text).toBe("Detailed product description here.");
      expect(match?.selector).toBe(".description");
      expect(match?.method).toBe("static");
      expect(match?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("closeBrowser", () => {
    it("can be called safely multiple times even if browser was not launched", async () => {
      await expect(closeBrowser()).resolves.toBeUndefined();
      await expect(closeBrowser()).resolves.toBeUndefined();
    });
  });

  describe("scrapeMultiField", () => {
    it("scrapeMultiField extracts multiple fields from single HTML page concurrently", async () => {
      const mockHtml = `
        <html>
          <body>
            <h1 class="product-title">Áo Thun Nam Cao Cấp</h1>
            <div class="product-price">199.000đ</div>
            <p class="desc">Chất liệu 100% cotton thoáng mát.</p>
          </body>
        </html>
      `;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = mock(() =>
          Promise.resolve(new Response(mockHtml, { status: 200 }))
        ) as any;

        const fields = [
          { id: "f_title", selectors: ["h1.product-title", "h1"] },
          { id: "f_price", selectors: [".product-price", ".price"] },
          { id: "f_desc", selectors: [".desc", "p"] },
          { id: "f_nonexist", selectors: [".not-found"] },
        ];

        const results = await scraper.scrapeMultiField("https://shop.example/p1", fields);

        expect(results.f_title?.text).toBe("Áo Thun Nam Cao Cấp");
        expect(results.f_title?.matchedSelector).toBe("h1.product-title");

        expect(results.f_price?.text).toBe("199.000đ");
        expect(results.f_price?.matchedSelector).toBe(".product-price");

        expect(results.f_desc?.text).toBe("Chất liệu 100% cotton thoáng mát.");

        expect(results.f_nonexist).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles static page from local server with multiple selectors and priority", async () => {
      const fields = [
        { id: "title", selectors: [".non-existent", ".main-title"] },
        { id: "price", selectors: [".price"] },
        { id: "desc", selectors: [".description"] },
        { id: "missing", selectors: [".does-not-exist"] },
      ];

      const results = await scrapeMultiField(`${baseUrl}/sample-page`, fields);

      expect(results.title?.text).toBe("Item Title & Details");
      expect(results.title?.matchedSelector).toBe(".main-title");
      expect(results.price?.text).toBe("$99.99");
      expect(results.price?.matchedSelector).toBe(".price");
      expect(results.desc?.text).toBe("Detailed product description here.");
      expect(results.desc?.matchedSelector).toBe(".description");
      expect(results.missing).toBeNull();
    });

    it("handles invalid selector syntax gracefully", async () => {
      const fields = [
        { id: "f1", selectors: [":::invalid-pseudo[[[", ".main-title"] },
      ];

      const results = await scrapeMultiField(`${baseUrl}/sample-page`, fields);
      expect(results.f1?.text).toBe("Item Title & Details");
      expect(results.f1?.matchedSelector).toBe(".main-title");
    });

    it("returns null for all fields on 404 response", async () => {
      const fields = [
        { id: "title", selectors: ["h1"] },
        { id: "desc", selectors: ["p"] },
      ];

      const results = await scrapeMultiField(`${baseUrl}/not-found`, fields);
      expect(results.title).toBeNull();
      expect(results.desc).toBeNull();
    });

    it("scrapeBrowserMulti extracts text containing r, n, t without corruption", async () => {
      const fields = [
        { id: "banner", selectors: [".product-banner"] },
        { id: "discount", selectors: [".discount-rate"] },
        { id: "missing", selectors: [".non-existent-selector"] },
      ];

      const results = await scrapeBrowserMulti(`${baseUrl}/dynamic-text-page`, fields);

      // Verify characters 'r', 'n', 't' are completely preserved
      expect(results.banner?.text).toBe("Return trend cotton product & notes");
      expect(results.banner?.matchedSelector).toBe(".product-banner");

      expect(results.discount?.text).toBe("45% off storewide");
      expect(results.discount?.matchedSelector).toBe(".discount-rate");

      // Verify non-matching field is explicitly null
      expect(results.missing).toBeNull();
    });

    it("scrapeBrowserMulti returns all requested field keys with null when no selectors match", async () => {
      const fields = [
        { id: "field_a", selectors: [".missing-a"] },
        { id: "field_b", selectors: [".missing-b"] },
      ];

      const results = await scrapeBrowserMulti(`${baseUrl}/empty-page`, fields);

      expect(Object.keys(results).sort()).toEqual(["field_a", "field_b"]);
      expect(results.field_a).toBeNull();
      expect(results.field_b).toBeNull();
    });

    it("scrapeMultiField falls back to browser when static fetch fails or is bypassed", async () => {
      // Mock fetch to simulate static network failure
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = mock(() => Promise.reject(new Error("Network Error"))) as any;

        const fields = [
          { id: "banner", selectors: [".product-banner"] },
          { id: "missing", selectors: [".non-existent"] },
        ];

        const results = await scrapeMultiField(`${baseUrl}/dynamic-text-page`, fields);

        // Fallback to browser worked and preserved r, n, t
        expect(results.banner?.text).toBe("Return trend cotton product & notes");
        expect(results.banner?.matchedSelector).toBe(".product-banner");
        expect(results.missing).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
