import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { NextRequest } from "next/server";
import { GET as getConfigs, POST as postConfig } from "../route";
import { PUT as putConfig, DELETE as deleteConfig } from "../[id]/route";
import * as db from "@/lib/db";

describe("Configs API Routes", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    mock.restore();
    process.env.DATABASE_URL = "postgresql://mock-test-url";
  });

  afterAll(() => {
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
  });

  describe("GET /api/configs", () => {
    it("returns configs list", async () => {
      spyOn(db, "getSavedConfigs").mockResolvedValue([
        {
          id: 1,
          name: "Test Config",
          description: "Desc",
          fields: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const res = await getConfigs();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.configs.length).toBe(1);
    });

    it("returns 500 when db.getSavedConfigs throws an error", async () => {
      spyOn(db, "getSavedConfigs").mockRejectedValue(new Error("Database connection error"));

      const res = await getConfigs();
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Database connection error");
    });

    it("returns 200 with dbConfigured: false when db is not configured", async () => {
      spyOn(db, "isDbConfigured").mockReturnValue(false);
      spyOn(db, "getSavedConfigs").mockResolvedValue([]);

      const res = await getConfigs();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.configs).toEqual([]);
      expect(json.dbConfigured).toBe(false);
    });
  });

  describe("POST /api/configs", () => {
    it("validates required fields and creates config", async () => {
      spyOn(db, "createSavedConfig").mockResolvedValue({
        id: 2,
        name: "New Config",
        description: null,
        fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const badReq = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
        headers: { "Content-Type": "application/json" },
      });
      const badRes = await postConfig(badReq);
      expect(badRes.status).toBe(400);

      const goodReq = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({
          name: "New Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const goodRes = await postConfig(goodReq);
      const json = await goodRes.json();

      expect(goodRes.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.config.id).toBe(2);
    });

    it("returns 400 when fields array is empty or not provided", async () => {
      const reqEmptyFields = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({ name: "Config Without Fields", fields: [] }),
        headers: { "Content-Type": "application/json" },
      });
      const resEmpty = await postConfig(reqEmptyFields);
      expect(resEmpty.status).toBe(400);

      const reqNoFields = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({ name: "Config Without Fields" }),
        headers: { "Content-Type": "application/json" },
      });
      const resNo = await postConfig(reqNoFields);
      expect(resNo.status).toBe(400);
    });

    it("returns 400 when request body contains invalid JSON", async () => {
      const badJsonReq = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: "not-json-string{",
        headers: { "Content-Type": "application/json" },
      });
      const res = await postConfig(badJsonReq);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Dữ liệu JSON không hợp lệ.");
    });

    it("returns 500 when createSavedConfig throws an error", async () => {
      spyOn(db, "createSavedConfig").mockRejectedValue(new Error("Insert failed"));

      const req = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({
          name: "Valid Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await postConfig(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Insert failed");
    });

    it("returns 503 when db is not configured", async () => {
      spyOn(db, "isDbConfigured").mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/configs", {
        method: "POST",
        body: JSON.stringify({
          name: "Valid Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await postConfig(req);
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cơ sở dữ liệu chưa được cấu hình");
    });
  });

  describe("PUT /api/configs/[id]", () => {
    it("updates existing config", async () => {
      spyOn(db, "updateSavedConfig").mockResolvedValue({
        id: 2,
        name: "Updated Config",
        description: null,
        fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: JSON.stringify({
          name: "Updated Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.config.name).toBe("Updated Config");
    });

    it("returns 400 for invalid ID", async () => {
      const req = new NextRequest("http://localhost:3000/api/configs/invalid", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated", fields: [{ id: "1" }] }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(req, { params: Promise.resolve({ id: "invalid" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty name or missing fields", async () => {
      const reqEmptyName = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: JSON.stringify({ name: "  ", fields: [{ id: "1" }] }),
        headers: { "Content-Type": "application/json" },
      });
      const resEmptyName = await putConfig(reqEmptyName, { params: Promise.resolve({ id: "2" }) });
      expect(resEmptyName.status).toBe(400);

      const reqNoFields = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: JSON.stringify({ name: "Valid Name", fields: [] }),
        headers: { "Content-Type": "application/json" },
      });
      const resNo = await putConfig(reqNoFields, { params: Promise.resolve({ id: "2" }) });
      expect(resNo.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const badReq = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: "bad-json-syntax{",
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(badReq, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Dữ liệu JSON không hợp lệ.");
    });

    it("returns 404 when config is not found", async () => {
      spyOn(db, "updateSavedConfig").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/configs/999", {
        method: "PUT",
        body: JSON.stringify({
          name: "Updated Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(req, { params: Promise.resolve({ id: "999" }) });
      expect(res.status).toBe(404);
    });

    it("returns 500 when updateSavedConfig throws an error", async () => {
      spyOn(db, "updateSavedConfig").mockRejectedValue(new Error("Update failed"));

      const req = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: JSON.stringify({
          name: "Updated Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Update failed");
    });

    it("returns 503 when db is not configured", async () => {
      spyOn(db, "isDbConfigured").mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/configs/2", {
        method: "PUT",
        body: JSON.stringify({
          name: "Updated Config",
          fields: [{ id: "f1", name: "Title", selectors: ["h1"], targetColumn: { mode: "new", colName: "Title" } }],
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await putConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cơ sở dữ liệu chưa được cấu hình");
    });
  });

  describe("DELETE /api/configs/[id]", () => {
    it("deletes config", async () => {
      spyOn(db, "deleteSavedConfig").mockResolvedValue(true);

      const req = new NextRequest("http://localhost:3000/api/configs/2", { method: "DELETE" });
      const res = await deleteConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("returns 400 for invalid ID", async () => {
      const req = new NextRequest("http://localhost:3000/api/configs/bad", { method: "DELETE" });
      const res = await deleteConfig(req, { params: Promise.resolve({ id: "bad" }) });
      expect(res.status).toBe(400);
    });

    it("returns 404 when config does not exist", async () => {
      spyOn(db, "deleteSavedConfig").mockResolvedValue(false);

      const req = new NextRequest("http://localhost:3000/api/configs/999", { method: "DELETE" });
      const res = await deleteConfig(req, { params: Promise.resolve({ id: "999" }) });
      expect(res.status).toBe(404);
    });

    it("returns 500 when deleteSavedConfig throws an error", async () => {
      spyOn(db, "deleteSavedConfig").mockRejectedValue(new Error("Delete failed"));

      const req = new NextRequest("http://localhost:3000/api/configs/2", { method: "DELETE" });
      const res = await deleteConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Delete failed");
    });

    it("returns 503 when db is not configured", async () => {
      spyOn(db, "isDbConfigured").mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/configs/2", { method: "DELETE" });
      const res = await deleteConfig(req, { params: Promise.resolve({ id: "2" }) });
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Cơ sở dữ liệu chưa được cấu hình");
    });
  });
});
