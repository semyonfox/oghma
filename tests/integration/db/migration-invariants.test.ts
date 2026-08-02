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

describe("repaired migration invariants", () => {
  it("records repaired migrations with unambiguous full identities", async () => {
    const rows = await sql`
      SELECT version, name
      FROM app.schema_migrations
      WHERE name = ANY(${[
        "053_assignment_type_icons.sql",
        "054_marker_serverless_jobs.sql",
        "055_note_links.sql",
        "056_canvas_ids_bigint.sql",
      ]})
      ORDER BY name
    `;

    expect(rows).toEqual([
      {
        version: "053_assignment_type_icons",
        name: "053_assignment_type_icons.sql",
      },
      {
        version: "054_marker_serverless_jobs",
        name: "054_marker_serverless_jobs.sql",
      },
      { version: "055_note_links", name: "055_note_links.sql" },
      { version: "056_canvas_ids_bigint", name: "056_canvas_ids_bigint.sql" },
    ]);
  });

  it("enforces the assignment type contract", async () => {
    const [column] = await sql`
      SELECT is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'assignments'
        AND column_name = 'assignment_type'
    `;
    const [constraint] = await sql`
      SELECT contype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'app.assignments'::regclass
        AND conname = 'assignments_assignment_type_check'
    `;

    expect(column).toMatchObject({ is_nullable: "NO" });
    expect(column.column_default).toContain("unknown");
    expect(constraint.contype).toBe("c");
    expect(constraint.definition).toContain("assignment_type");
    for (const value of ["quiz", "assignment", "manual", "unknown"]) {
      expect(constraint.definition).toContain(value);
    }
  });

  it("keeps marker job identity, ownership, and cleanup constraints", async () => {
    const constraints = await sql`
      SELECT conname, contype, confdeltype
      FROM pg_constraint
      WHERE conrelid = 'app.marker_jobs'::regclass
    `;
    const byName = new Map(constraints.map((row) => [row.conname, row]));

    expect(byName.get("marker_jobs_pkey")?.contype).toBe("p");
    expect(byName.get("marker_jobs_runpod_job_id_key")?.contype).toBe("u");
    expect(byName.get("marker_jobs_note_id_fkey")).toMatchObject({
      contype: "f",
      confdeltype: "c",
    });
    expect(byName.get("marker_jobs_user_id_fkey")).toMatchObject({
      contype: "f",
      confdeltype: "c",
    });
    expect(byName.get("marker_jobs_canvas_job_id_fkey")).toMatchObject({
      contype: "f",
      confdeltype: "n",
    });
    expect(byName.get("marker_jobs_parent_folder_id_fkey")).toMatchObject({
      contype: "f",
      confdeltype: "n",
    });

    const [index] = await sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'app'
        AND tablename = 'marker_jobs'
        AND indexname = 'idx_marker_jobs_note'
    `;
    expect(index.indexdef).toMatch(/\(note_id, created_at DESC\)/);
  });

  it("prevents invalid note links and indexes backlink lookups", async () => {
    const constraints = await sql`
      SELECT conname, contype, confdeltype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'app.note_links'::regclass
    `;

    expect(
      constraints.find((row) => row.conname === "note_links_pkey")?.contype,
    ).toBe("p");
    const foreignKeys = constraints.filter((row) => row.contype === "f");
    expect(foreignKeys).toHaveLength(3);
    expect(foreignKeys.every((row) => row.confdeltype === "c")).toBe(true);
    expect(
      constraints.some(
        (row) =>
          row.contype === "c" &&
          row.definition.includes("source_note_id <> target_note_id"),
      ),
    ).toBe(true);

    const [index] = await sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'app'
        AND tablename = 'note_links'
        AND indexname = 'idx_note_links_target'
    `;
    expect(index.indexdef).toMatch(/\(user_id, target_note_id\)/);
  });
});
