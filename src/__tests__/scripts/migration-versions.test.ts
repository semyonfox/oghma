import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationFile = "052_make_marketing_lead_role_nullable.sql";

describe("public contact form migration", () => {
  it("has a unique migration version so the normal runner applies it", () => {
    const files = readdirSync(resolve(process.cwd(), "database/migrations"))
      .filter((file) => file.endsWith(".sql"));
    const version = migrationFile.match(/^(\d+)/)?.[1];

    expect(files).toContain(migrationFile);
    expect(files.filter((file) => file.startsWith(`${version}_`))).toEqual([
      migrationFile,
    ]);
  });
});
