import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { requireE2EDatabaseUrl } from "../helpers/env";

// runs after e2e:reset, so every checked-in migration is already applied
const databaseUrl = requireE2EDatabaseUrl();
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const migrationsDir = resolve(process.cwd(), "database/migrations");
const execFileAsync = promisify(execFile);

function runner(args: string[]) {
  return execFileAsync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-migration.ts", ...args],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 20_000 },
  );
}

function migrationSql(suffix: string): string {
  const file = readdirSync(migrationsDir).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`missing migration *${suffix}`);
  return readFileSync(resolve(migrationsDir, file), "utf8");
}

async function rolledBack(work: (tx: postgres.TransactionSql) => Promise<void>) {
  await expect(
    sql.begin(async (tx) => {
      await work(tx);
      throw new Error("rollback fixture");
    }),
  ).rejects.toThrow("rollback fixture");
}

afterAll(async () => {
  await sql.end();
});

describe("migration runner", () => {
  it("waits for another runner's lock before reading applied migrations", async () => {
    const holder = postgres(databaseUrl, { max: 1 });
    try {
      await holder`SELECT pg_advisory_lock(hashtext('oghmanotes:schema_migrations'))`;
      let settled = false;
      const pending = runner(["--all"]).finally(() => {
        settled = true;
      });
      await new Promise((done) => setTimeout(done, 1_500));
      expect(settled).toBe(false);

      await holder`SELECT pg_advisory_unlock(hashtext('oghmanotes:schema_migrations'))`;
      const { stdout } = await pending;
      expect(stdout).toContain("all migrations already applied");
    } finally {
      await holder.end();
    }
  });

  it("records a checksum for every applied migration", async () => {
    await runner(["--all"]);
    const rows = await sql<{ name: string; checksum: string | null }[]>`
      SELECT name, checksum FROM app.schema_migrations
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !/^[a-f0-9]{64}$/.test(row.checksum ?? ""))).toEqual([]);
  });

  it("refuses to re-run an applied migration by name", async () => {
    await expect(runner(["017_user_course_settings.sql"])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("already applied"),
    });
  });

  it("prints usage instead of running a default migration", async () => {
    await expect(runner([])).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("usage:"),
    });
  });
});

describe("schema repair migrations", () => {
  it("converts drifted NUMERIC assignment columns to double precision", async () => {
    await rolledBack(async (tx) => {
      await tx`ALTER TABLE app.assignments ALTER COLUMN score TYPE numeric`;
      await tx`ALTER TABLE app.assignments ALTER COLUMN logged_hours TYPE numeric`;
      await tx.unsafe(migrationSql("_assignment_floats_and_fk_indexes.sql"));

      const columns = await tx<{ column_name: string; data_type: string }[]>`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'assignments'
          AND column_name = ANY(${["estimated_hours", "logged_hours", "score", "points_possible"]})
        ORDER BY column_name
      `;
      expect(columns.map((column) => column.data_type)).toEqual([
        "double precision",
        "double precision",
        "double precision",
        "double precision",
      ]);
    });
  });

  it("indexes the referencing side of hot delete actions", async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'app' AND indexname = ANY(${[
        "idx_marker_jobs_parent_folder",
        "idx_marker_jobs_canvas_job",
        "idx_imported_file_cache_owner_import",
        "idx_imported_file_cache_owner_job",
        "idx_canvas_import_jobs_source_job",
        "idx_chat_tool_actions_session",
      ]})
    `;
    expect(rows).toHaveLength(6);
  });
});
