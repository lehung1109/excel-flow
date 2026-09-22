import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { clearTempStore, getTempFile, saveTempFile } from "../temp-store";

describe("temp-store", () => {
  beforeEach(() => {
    clearTempStore?.();
  });

  afterEach(() => {
    clearTempStore?.();
  });

  describe("saveTempFile", () => {
    it("stores a buffer and filename, and returns a valid UUID string", () => {
      const buffer = Buffer.from("test excel content");
      const filename = "test.xlsx";
      const id = saveTempFile(buffer, filename);

      expect(typeof id).toBe("string");
      // Validate UUID v4 format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it("generates distinct IDs for different files", () => {
      const buf1 = Buffer.from("content 1");
      const buf2 = Buffer.from("content 2");

      const id1 = saveTempFile(buf1, "file1.xlsx");
      const id2 = saveTempFile(buf2, "file2.xlsx");

      expect(id1).not.toBe(id2);
    });
  });

  describe("getTempFile", () => {
    it("retrieves the stored buffer and filename by ID", () => {
      const buffer = Buffer.from("sample spreadsheet data");
      const filename = "report.xlsx";
      const id = saveTempFile(buffer, filename);

      const retrieved = getTempFile(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.filename).toBe(filename);
      expect(retrieved?.buffer.toString()).toBe("sample spreadsheet data");
    });

    it("returns null for non-existent ID", () => {
      const result = getTempFile("non-existent-uuid-1234");
      expect(result).toBeNull();
    });

    it("returns null and deletes file if file is older than 1 hour (TTL expiration)", () => {
      const baseTime = 1000000000000;
      const dateSpy = spyOn(Date, "now").mockReturnValue(baseTime);

      try {
        const buffer = Buffer.from("data to expire");
        const filename = "expiring.xlsx";
        const id = saveTempFile(buffer, filename);

        // Verify it is accessible immediately
        expect(getTempFile(id)).not.toBeNull();

        // Advance time by 30 minutes (within TTL of 60 mins)
        dateSpy.mockReturnValue(baseTime + 30 * 60 * 1000);
        expect(getTempFile(id)).not.toBeNull();

        // Advance time to 1 hour + 1 millisecond (expired)
        dateSpy.mockReturnValue(baseTime + 60 * 60 * 1000 + 1);
        expect(getTempFile(id)).toBeNull();

        // Ensure it was removed and remains null
        dateSpy.mockReturnValue(baseTime + 10);
        expect(getTempFile(id)).toBeNull();
      } finally {
        dateSpy.mockRestore();
      }
    });

    it("handles binary data correctly without corruption", () => {
      const binaryData = Buffer.from([0x00, 0xff, 0x42, 0x13, 0x37]);
      const id = saveTempFile(binaryData, "binary.xlsx");

      const retrieved = getTempFile(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.buffer).toEqual(binaryData);
    });
  });
});
