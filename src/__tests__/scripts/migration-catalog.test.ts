import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findAppliedMigration,
  findChangedMigrations,
  isLegacyMigration,
  migrationChecksum,
  migrationVersion,
  rollbackBreakingChanges,
  rollbackGuardBaseline,
} from "../../../scripts/migration-catalog";

describe("migration catalog", () => {
  it("treats only 001-017 as adopted legacy history", () => {
    expect(isLegacyMigration("001_schema_migrations.sql")).toBe(true);
    expect(isLegacyMigration("017_user_course_settings.sql")).toBe(true);
    expect(isLegacyMigration("018_indexes_and_query_fixes.sql")).toBe(false);
    expect(isLegacyMigration("077_study_analysis_cache.sql")).toBe(false);
  });

  it("finds rows recorded under legacy numeric, full id, or file name identities", () => {
    const applied = [
      { version: "017", name: "017_user_course_settings.sql" },
      { version: "055_note_links", name: "055_note_links.sql" },
    ];
    expect(findAppliedMigration("017_user_course_settings.sql", applied)?.version).toBe("017");
    expect(findAppliedMigration("055_note_links.sql", applied)?.version).toBe("055_note_links");
    expect(findAppliedMigration("056_canvas_ids_bigint.sql", applied)).toBeUndefined();
  });

  it("reports an applied migration whose SQL was edited afterwards", () => {
    const original = migrationChecksum("CREATE TABLE app.example (id int);\n");
    const edited = migrationChecksum("CREATE TABLE app.example (id bigint);\n");
    const applied = [
      { version: "078_example", name: "078_example.sql", checksum: original },
      { version: "079_other", name: "079_other.sql", checksum: original },
    ];

    expect(
      findChangedMigrations(
        [
          { name: "078_example.sql", checksum: edited },
          { name: "079_other.sql", checksum: original },
        ],
        applied,
      ),
    ).toEqual(["078_example.sql"]);
  });

  it("does not report rows recorded before checksums existed or pending files", () => {
    const applied = [{ version: "017", name: "017_user_course_settings.sql", checksum: null }];
    expect(
      findChangedMigrations(
        [
          { name: "017_user_course_settings.sql", checksum: migrationChecksum("a") },
          { name: "080_pending.sql", checksum: migrationChecksum("b") },
        ],
        applied,
      ),
    ).toEqual([]);
  });
});

describe("rollback-safe migrations", () => {
  it("flags changes the previous release cannot run against", () => {
    expect(rollbackBreakingChanges("ALTER TABLE app.notes DROP COLUMN legacy;")).toEqual(["drops a column"]);
    expect(rollbackBreakingChanges("ALTER TABLE app.notes RENAME COLUMN a TO b;")).toContain("renames a table or column");
    expect(rollbackBreakingChanges("ALTER TABLE app.notes ALTER COLUMN size TYPE bigint;")).toEqual(["changes a column type"]);
    expect(rollbackBreakingChanges("ALTER TABLE app.notes ALTER COLUMN title SET NOT NULL;")).toEqual(["adds a not-null constraint"]);
    expect(rollbackBreakingChanges("DROP TABLE IF EXISTS app.old_cache;")).toEqual(["drops a table"]);
    // postgres lets COLUMN be omitted
    expect(rollbackBreakingChanges("ALTER TABLE app.notes DROP legacy;")).toEqual(["drops a column"]);
    expect(rollbackBreakingChanges("ALTER TABLE app.notes ALTER legacy TYPE bigint;")).toEqual(["changes a column type"]);
    expect(rollbackBreakingChanges("ALTER TABLE app.notes ADD COLUMN required text NOT NULL;")).toEqual(["adds a required column without a default"]);
  });

  it("allows additive changes, comments and an explained exception", () => {
    expect(rollbackBreakingChanges("-- drop column later\nALTER TABLE app.notes ADD COLUMN pinned boolean NOT NULL DEFAULT false;\nDROP INDEX IF EXISTS app.idx_old;")).toEqual([]);
    expect(rollbackBreakingChanges("ALTER TABLE app.notes DROP CONSTRAINT notes_old_check, ALTER COLUMN title DROP NOT NULL, ADD COLUMN size numeric(10,2);")).toEqual([]);
    expect(rollbackBreakingChanges("-- rollback-safe: nothing has read this table since 079\nDROP TABLE app.old_cache;")).toEqual([]);
  });

  it("keeps every new migration safe to roll back over", () => {
    const directory = new URL("../../../database/migrations/", import.meta.url);
    const breaking = readdirSync(directory)
      .filter((file) => Number(migrationVersion(file)) > rollbackGuardBaseline)
      .flatMap((file) => rollbackBreakingChanges(readFileSync(new URL(file, directory), "utf8")).map((reason) => `${file} ${reason}`));
    // split the change across releases, or add `-- rollback-safe: <why>` to the migration
    expect(breaking).toEqual([]);
  });
});
