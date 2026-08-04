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
          "assignments",
          "canvas_planner_items",
          "marker_jobs",
          "note_links",
          "marketing_leads",
          "marketing_events",
          "rate_limit_log",
          "user_course_settings",
          "chat_sessions",
          "chat_messages",
          "chat_generations",
          "imported_file_cache",
          "imported_file_cache_chunks",
          "imported_file_cache_assets",
          "imported_file_sources",
        ]})
    `;

    expect(rows.map((row) => row.table_name).sort()).toEqual([
      "assignments",
      "attachments",
      "canvas_import_jobs",
      "canvas_planner_items",
      "chat_generations",
      "chat_messages",
      "chat_sessions",
      "imported_file_cache",
      "imported_file_cache_assets",
      "imported_file_cache_chunks",
      "imported_file_sources",
      "ingestion_jobs",
      "login",
      "marker_jobs",
      "marketing_events",
      "marketing_leads",
      "note_links",
      "notes",
      "rate_limit_log",
      "tree_items",
      "user_course_settings",
    ]);
  });

  it("stores embeddings outside Postgres", async () => {
    const [row] = await sql`
      SELECT to_regclass('app.embeddings') AS embeddings_table
    `;

    expect(row.embeddings_table).toBeNull();
  });

  it("stores every Canvas integer identity as bigint", async () => {
    const expected = [
      "assignments.canvas_assignment_id",
      "assignments.canvas_course_id",
      "canvas_imports.canvas_course_id",
      "canvas_imports.canvas_file_id",
      "canvas_imports.canvas_module_id",
      "notes.canvas_assignment_id",
      "notes.canvas_course_id",
      "notes.canvas_module_id",
      "user_course_settings.canvas_course_id",
    ];
    const rows = await sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND (table_name || '.' || column_name) = ANY(${expected})
    `;

    expect(rows.map((row) => `${row.table_name}.${row.column_name}`).sort()).toEqual(
      expected,
    );
    expect(new Set(rows.map((row) => row.data_type))).toEqual(
      new Set(["bigint"]),
    );
  });

  it("matches runtime column names and types for current calendar, ingestion, chat, and planner schema", async () => {
    const rows = await sql`
      SELECT table_name, column_name, data_type, udt_name, is_nullable
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
 OR (table_name = 'chat_sessions' AND column_name = ANY(${[
   "generation_status",
   "pinned",
 ]}))
 OR (table_name = 'chat_generations' AND column_name = ANY(${[
   "session_id",
   "status",
 ]}))
 OR (table_name = 'assignments' AND column_name = 'assignment_type')
 OR (table_name = 'canvas_planner_items' AND column_name = ANY(${[
   "plannable_type",
   "date_source",
 ]}))
 OR (table_name = 'marketing_leads' AND column_name = 'role')
        )
    `;

    const byColumn = new Map(
      rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );
    expect(byColumn.get("login.calendar_export_token")?.udt_name).toBe("uuid");
    expect(byColumn.get("ingestion_jobs.chunks_stored")?.data_type).toBe(
      "integer",
    );
    expect(byColumn.get("ingestion_jobs.error")?.data_type).toBe("text");
    expect(byColumn.get("chat_sessions.generation_status")?.data_type).toBe(
      "text",
    );
    expect(byColumn.get("chat_sessions.pinned")?.data_type).toBe("boolean");
    expect(byColumn.get("chat_generations.session_id")?.udt_name).toBe("uuid");
    expect(byColumn.get("chat_generations.status")?.data_type).toBe("text");
    expect(byColumn.get("assignments.assignment_type")?.data_type).toBe("text");
    expect(byColumn.get("canvas_planner_items.plannable_type")?.data_type).toBe(
      "text",
    );
    expect(byColumn.get("canvas_planner_items.date_source")?.data_type).toBe(
      "text",
    );
    expect(byColumn.get("marketing_leads.role")?.is_nullable).toBe("YES");
  });
});
