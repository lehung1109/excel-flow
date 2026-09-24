import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  initDb,
  resetDbInitForTesting,
  getSavedConfigs,
  createSavedConfig,
  updateSavedConfig,
  deleteSavedConfig,
  setSqlExecutorForTesting,
  isDbConfigured,
  getSql,
} from "../db";
import type { ExtractionFieldConfig } from "@/types/crawler";

describe("Neon DB Layer", () => {
  const mockRows: any[] = [];
  const mockSql = mock((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join("?");
    if (query.includes("CREATE TABLE")) {
      return Promise.resolve([]);
    }
    if (query.includes("SELECT id, name, description, fields, created_at, updated_at")) {
      return Promise.resolve(mockRows);
    }
    if (query.includes("INSERT INTO saved_configs")) {
      const inserted = {
        id: mockRows.length + 1,
        name: values[0],
        description: values[1],
        fields: typeof values[2] === "string" ? JSON.parse(values[2]) : values[2],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockRows.push(inserted);
      return Promise.resolve([inserted]);
    }
    if (query.includes("UPDATE saved_configs")) {
      const id = values[3];
      const found = mockRows.find((r) => r.id === id);
      if (found) {
        found.name = values[0];
        found.description = values[1];
        found.fields = typeof values[2] === "string" ? JSON.parse(values[2]) : values[2];
        found.updated_at = new Date().toISOString();
        return Promise.resolve([found]);
      }
      return Promise.resolve([]);
    }
    if (query.includes("DELETE FROM saved_configs")) {
      const id = values[0];
      const idx = mockRows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const deleted = mockRows.splice(idx, 1);
        return Promise.resolve(deleted);
      }
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  beforeEach(() => {
    mockRows.length = 0;
    setSqlExecutorForTesting(mockSql as any);
  });

  it("initializes table schema successfully", async () => {
    await expect(initDb()).resolves.toBeUndefined();
  });

  it("recovers from initial schema creation failure and retries on subsequent call", async () => {
    resetDbInitForTesting();
    let failFirst = true;
    const failingSql = mock(() => {
      if (failFirst) {
        failFirst = false;
        return Promise.reject(new Error("Connection timeout"));
      }
      return Promise.resolve([]);
    });
    setSqlExecutorForTesting(failingSql as any);

    await expect(initDb()).rejects.toThrow("Connection timeout");
    // Next call retries and succeeds, not permanently holding the rejected promise
    await expect(initDb()).resolves.toBeUndefined();
  });

  it("creates, retrieves, updates, and deletes saved configs", async () => {
    const fields: ExtractionFieldConfig[] = [
      {
        id: "f1",
        name: "Tiêu đề",
        selectors: ["h1"],
        targetColumn: { mode: "new", colName: "Tieu_De" },
      },
    ];

    const created = await createSavedConfig("Config 1", "Mô tả 1", fields);
    expect(created.id).toBe(1);
    expect(created.name).toBe("Config 1");
    expect(created.fields).toEqual(fields);

    const list = await getSavedConfigs();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Config 1");

    const updated = await updateSavedConfig(1, "Config 1 Updated", "Mô tả mới", fields);
    expect(updated?.name).toBe("Config 1 Updated");

    const deleted = await deleteSavedConfig(1);
    expect(deleted).toBe(true);

    const listAfterDelete = await getSavedConfigs();
    expect(listAfterDelete.length).toBe(0);
  });

  it("handles unconfigured database gracefully", async () => {
    setSqlExecutorForTesting(null);
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalPostgresUrl = process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;

    try {
      expect(isDbConfigured()).toBe(false);
      const configs = await getSavedConfigs();
      expect(configs).toEqual([]);

      expect(() => getSql()).toThrow("Neon DATABASE_URL or POSTGRES_URL environment variable is missing.");
    } finally {
      if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalPostgresUrl) process.env.POSTGRES_URL = originalPostgresUrl;
    }
  });
});
