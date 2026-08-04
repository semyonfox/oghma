import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFiles = [
  "052_make_marketing_lead_role_nullable.sql",
  "057_marker_provider_dispatch.sql",
  "058_marker_dispatch_guards.sql",
];

describe("current migrations", () => {
  it.each(migrationFiles)(
    "%s has a unique version so the normal runner applies it",
    (migrationFile) => {
      const files = readdirSync(resolve(process.cwd(), "database/migrations"))
        .filter((file) => file.endsWith(".sql"));
      const version = migrationFile.match(/^(\d+)/)?.[1];

      expect(files).toContain(migrationFile);
      expect(files.filter((file) => file.startsWith(`${version}_`))).toEqual([
        migrationFile,
      ]);
    },
  );
});
