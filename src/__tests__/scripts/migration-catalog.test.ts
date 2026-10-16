import { describe, expect, it } from "vitest";
import {
  findAppliedMigration,
  findChangedMigrations,
  isLegacyMigration,
  migrationChecksum,
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
