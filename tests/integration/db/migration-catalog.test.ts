import { describe, expect, it } from "vitest";
import {
  assertUniqueMigrationVersions,
  isMigrationApplied,
  migrationId,
  migrationVersion,
  readMigrationFiles,
} from "../../../scripts/migration-catalog.mjs";
import { resolve } from "node:path";

describe("migration catalog", () => {
  it("uses the complete filename as the migration identity", () => {
    expect(migrationId("053_assignment_type_icons.sql")).toBe(
      "053_assignment_type_icons",
    );
    expect(migrationVersion("053_assignment_type_icons.sql")).toBe("053");
  });

  it("rejects duplicate numeric versions before migrations can run", () => {
    expect(() =>
      assertUniqueMigrationVersions([
        "053_assignment_type_icons.sql",
        "053_marker_serverless_jobs.sql",
      ]),
    ).toThrow(/Duplicate migration version 053/);
  });

  it("has a unique version for every checked-in migration", () => {
    expect(() =>
      readMigrationFiles(resolve(process.cwd(), "database/migrations")),
    ).not.toThrow();
  });

  it.each([
    "049_assignment_type_icons.sql",
    "049_marker_serverless_jobs.sql",
    "049_note_links.sql",
  ])("replays every repair after legacy %s", (legacyName) => {
    const legacyApplied = [{ version: "049", name: legacyName }];

    for (const repair of [
      "053_assignment_type_icons.sql",
      "054_marker_serverless_jobs.sql",
      "055_note_links.sql",
    ]) {
      expect(isMigrationApplied(repair, legacyApplied)).toBe(false);
    }
  });
});
