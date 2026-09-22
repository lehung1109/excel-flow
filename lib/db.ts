import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ExtractionFieldConfig, SavedConfigRecord } from "@/types/crawler";

let customSqlExecutor: NeonQueryFunction<false, false> | null = null;

export function setSqlExecutorForTesting(executor: NeonQueryFunction<false, false> | null) {
  customSqlExecutor = executor;
}

export function getSql() {
  if (customSqlExecutor) {
    return customSqlExecutor;
  }
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("Neon DATABASE_URL or POSTGRES_URL environment variable is missing.");
  }
  return neon(connectionString);
}

export async function initDb(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS saved_configs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      fields JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

export async function getSavedConfigs(): Promise<SavedConfigRecord[]> {
  const sql = getSql();
  await initDb();
  const rows = await sql`
    SELECT id, name, description, fields, created_at, updated_at
    FROM saved_configs
    ORDER BY updated_at DESC
  `;
  return rows.map((r: any) => ({
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

export async function createSavedConfig(
  name: string,
  description: string | null | undefined,
  fields: ExtractionFieldConfig[]
): Promise<SavedConfigRecord> {
  const sql = getSql();
  await initDb();
  const fieldsJson = JSON.stringify(fields);
  const rows = await sql`
    INSERT INTO saved_configs (name, description, fields, updated_at)
    VALUES (${name.trim()}, ${description?.trim() || null}, ${fieldsJson}::jsonb, CURRENT_TIMESTAMP)
    RETURNING id, name, description, fields, created_at, updated_at
  `;
  const r = rows[0];
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function updateSavedConfig(
  id: number,
  name: string,
  description: string | null | undefined,
  fields: ExtractionFieldConfig[]
): Promise<SavedConfigRecord | null> {
  const sql = getSql();
  await initDb();
  const fieldsJson = JSON.stringify(fields);
  const rows = await sql`
    UPDATE saved_configs
    SET name = ${name.trim()}, description = ${description?.trim() || null}, fields = ${fieldsJson}::jsonb, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, name, description, fields, created_at, updated_at
  `;
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function deleteSavedConfig(id: number): Promise<boolean> {
  const sql = getSql();
  await initDb();
  const rows = await sql`
    DELETE FROM saved_configs
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}
