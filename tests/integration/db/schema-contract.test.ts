import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

const sql = postgres(requireE2EDatabaseUrl(), {
  ssl: (process.env.DATABASE_URL || "").includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
  max: 1,
});

afterAll(async () => {
  await sql.end();
});

describe("E2E database schema contract", () => {
  it("has the core tables used by browser smoke flows", async () => {
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND table_name = ANY(${[
          "login",
          "notes",
          "tree_items",
          "attachments",
          "canvas_import_jobs",
          "ingestion_jobs",
          "rate_limit_log",
          "chat_sessions",
          "chat_messages",
        ]})
    `;

    expect(rows.map((row) => row.table_name).sort()).toEqual([
      "attachments",
      "canvas_import_jobs",
      "chat_messages",
      "chat_sessions",
      "ingestion_jobs",
      "login",
      "notes",
      "rate_limit_log",
      "tree_items",
    ]);
  });

  it("stores embeddings outside Postgres", async () => {
    const [row] = await sql`
      SELECT to_regclass('app.embeddings') AS embeddings_table
    `;

    expect(row.embeddings_table).toBeNull();
  });

  it("matches runtime column names and types for calendar and ingestion", async () => {
    const rows = await sql`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND (
          (table_name = 'login' AND column_name = 'calendar_export_token')
          OR (table_name = 'ingestion_jobs' AND column_name = ANY(${[
            "status",
            "chunks_stored",
            "error",
            "created_at",
            "updated_at",
          ]}))
        )
    `;

    const byColumn = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
    expect(byColumn.get("login.calendar_export_token")?.udt_name).toBe("uuid");
    expect(byColumn.get("ingestion_jobs.chunks_stored")?.data_type).toBe("integer");
    expect(byColumn.get("ingestion_jobs.error")?.data_type).toBe("text");
  });
});
