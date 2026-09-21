import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { closeBrowser, scrapeHybrid, scrapeStatic } from "../scraper";

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
});
