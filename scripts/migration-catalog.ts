import { createHash } from "node:crypto";
import { readdirSync, type PathLike } from "node:fs";

const migrationPattern = /^(\d+)_.*\.sql$/;

// 001-017 predate app.schema_migrations. Adoption records them without running
// them, so a fresh database must come from the baseline snapshot instead.
const legacyMaxVersion = 17;

export interface AppliedMigration {
  name: string;
  version: string;
  // null for rows recorded before the runner stored checksums
  checksum?: string | null;
}

export function migrationId(filename: string): string {
  return filename.replace(/\.sql$/, "");
}

export function migrationVersion(filename: string): string | undefined {
  return filename.match(migrationPattern)?.[1];
}

export function isLegacyMigration(filename: string): boolean {
  return Number(migrationVersion(filename)) <= legacyMaxVersion;
}

export function migrationChecksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function sortMigrationFiles(files: readonly string[]): string[] {
  return [...files].sort((left, right) => {
    const versionDelta = Number(migrationVersion(left)) - Number(migrationVersion(right));
    return versionDelta || left.localeCompare(right);
  });
}

export function assertUniqueMigrationVersions(files: readonly string[]): void {
  const versions = new Map<string, string>();
  for (const filename of files) {
    const version = migrationVersion(filename);
    if (!version) throw new Error(`Invalid migration filename: ${filename}`);
    const existing = versions.get(version);
    if (existing) {
      throw new Error(
        `Duplicate migration version ${version}: ${existing} and ${filename}. ` +
          "Rename one migration with the next unused version.",
      );
    }
    versions.set(version, filename);
  }
}

export function findAppliedMigration(
  filename: string,
  applied: readonly AppliedMigration[],
): AppliedMigration | undefined {
  const identity = migrationId(filename);
  const legacyVersion = migrationVersion(filename);

  return applied.find(
    (migration) =>
      migration.name === filename ||
      migration.version === identity ||
      // Pre-repair runners stored only the numeric prefix. The catalog rejects
      // duplicate prefixes, so this compatibility path is unambiguous.
      migration.version === legacyVersion,
  );
}

export function isMigrationApplied(
  filename: string,
  applied: readonly AppliedMigration[],
): boolean {
  return findAppliedMigration(filename, applied) !== undefined;
}

/**
 * Applied migrations whose checked-in SQL no longer matches what was recorded.
 * Editing an applied file never reaches databases that already ran it, so the
 * change has to ship as a new migration instead.
 */
export function findChangedMigrations(
  files: ReadonlyArray<{ name: string; checksum: string }>,
  applied: readonly AppliedMigration[],
): string[] {
  return files
    .filter((file) => {
      const recorded = findAppliedMigration(file.name, applied)?.checksum;
      return typeof recorded === "string" && recorded !== file.checksum;
    })
    .map((file) => file.name);
}

export function readMigrationFiles(migrationsDir: PathLike): string[] {
  const files = sortMigrationFiles(
    readdirSync(migrationsDir).filter((filename) => filename.endsWith(".sql")),
  );
  assertUniqueMigrationVersions(files);
  return files;
}

// a rollback redeploys the previous image against the migrated schema, so a migration
// must not break the release before it. drops, renames and tightened columns belong
// in a later release than the code that stops using them
const rollbackBreakingPatterns: ReadonlyArray<[string, RegExp]> = [
  ["drops a table", /\bdrop\s+table\b/i],
  ["drops a column", /\bdrop\s+column\b/i],
  ["renames a table or column", /\brename\s+(column\b|to\b|[a-z_"])/i],
  ["changes a column type", /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i],
  ["adds a not-null constraint", /\bset\s+not\s+null\b/i],
];

// the last migration released before this guard; earlier history is not rechecked
export const rollbackGuardBaseline = 82;

/** reasons a migration would break the previous release, unless it says why it is safe */
export function rollbackBreakingChanges(contents: string): string[] {
  if (/^--\s*rollback-safe:\s*\S/im.test(contents)) return [];
  const sql = contents.replace(/--.*$/gm, "");
  return rollbackBreakingPatterns.filter(([, pattern]) => pattern.test(sql)).map(([reason]) => reason);
}
