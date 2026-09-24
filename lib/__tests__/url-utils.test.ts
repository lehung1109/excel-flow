import { describe, expect, it } from "bun:test";
import { calculateETA, normalizeUrl, sanitizeExtractedText } from "../url-utils";

describe("url-utils", () => {
  describe("normalizeUrl", () => {
    it("returns null for empty or non-string input", () => {
      expect(normalizeUrl("")).toBeNull();
      expect(normalizeUrl(null)).toBeNull();
      expect(normalizeUrl(undefined)).toBeNull();
      expect(normalizeUrl(12345)).toBeNull();
      expect(normalizeUrl({})).toBeNull();
      expect(normalizeUrl("   ")).toBeNull();
    });

    it("keeps valid http/https URLs as-is", () => {
      expect(normalizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
      expect(normalizeUrl("http://example.com")).toBe("http://example.com");
      expect(normalizeUrl("https://sub.domain.org/items/42#section")).toBe(
        "https://sub.domain.org/items/42#section"
      );
    });

    it("prepends https:// if protocol is omitted, including when port is present", () => {
      expect(normalizeUrl("example.com/products/item-1")).toBe(
        "https://example.com/products/item-1"
      );
      expect(normalizeUrl("www.google.com")).toBe("https://www.google.com");
      expect(normalizeUrl("subdomain.example.com/api/test")).toBe(
        "https://subdomain.example.com/api/test"
      );
      expect(normalizeUrl("example.com:8080/products")).toBe(
        "https://example.com:8080/products"
      );
    });

    it("returns null for invalid strings that cannot be valid URLs", () => {
      expect(normalizeUrl("not an url at all")).toBeNull();
      expect(normalizeUrl("http://")).toBeNull();
      expect(normalizeUrl("https://")).toBeNull();
    });

    it("returns null for non-http/https protocols", () => {
      expect(normalizeUrl("ftp://example.com/file.zip")).toBeNull();
      expect(normalizeUrl("mailto:user@example.com")).toBeNull();
      expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    });
  });

  describe("sanitizeExtractedText", () => {
    it("trims excess whitespace and unescapes common entities", () => {
      const input = "   Hello &nbsp; World &amp; Friends   \n\n\n  Good  day!  ";
      const result = sanitizeExtractedText(input);
      expect(result).toBe("Hello World & Friends Good day!");
    });

    it("handles all specified HTML entities", () => {
      const input = "Quotes: &quot;double&quot; and &#39;single&#39; and &#x27;hex&#x27; and &apos;apos&apos;, tags: &lt;tag&gt;";
      const result = sanitizeExtractedText(input);
      expect(result).toBe("Quotes: \"double\" and 'single' and 'hex' and 'apos', tags: <tag>");
    });

    it("avoids double-unescaping when &amp; is part of an encoded entity", () => {
      const input = "&amp;lt;div&amp;gt; &amp;amp; &amp;quot;";
      const result = sanitizeExtractedText(input);
      expect(result).toBe("&lt;div&gt; &amp; &quot;");
    });

    it("handles empty or whitespace-only strings", () => {
      expect(sanitizeExtractedText("")).toBe("");
      expect(sanitizeExtractedText("   \n\t  ")).toBe("");
    });

    it("handles falsy input", () => {
      expect(sanitizeExtractedText("" as string)).toBe("");
    });
  });

  describe("calculateETA", () => {
    it("calculates remaining seconds based on elapsed time and progress", () => {
      const now = Date.now();
      const startTime = now - 10000; // 10s elapsed
      // 10 done out of 100 in 10s -> 1s per item -> 90 items left -> 90s
      const eta = calculateETA(startTime, 10, 100);
      expect(eta).toBeGreaterThanOrEqual(88);
      expect(eta).toBeLessThanOrEqual(92);
    });

    it("returns 0 if processed equals total or processed is 0", () => {
      const now = Date.now();
      expect(calculateETA(now, 0, 100)).toBe(0);
      expect(calculateETA(now - 5000, 100, 100)).toBe(0);
    });

    it("returns 0 if processed is negative or exceeds total", () => {
      const now = Date.now();
      expect(calculateETA(now - 5000, -5, 100)).toBe(0);
      expect(calculateETA(now - 5000, 105, 100)).toBe(0);
    });
  });
});
