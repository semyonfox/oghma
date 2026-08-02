import { readdirSync } from "fs";

const migrationPattern = /^(\d+)_.*\.sql$/;

export function migrationId(filename) {
  return filename.replace(/\.sql$/, "");
}

export function migrationVersion(filename) {
  return filename.match(migrationPattern)?.[1];
}

export function sortMigrationFiles(files) {
  return [...files].sort((left, right) => {
    const versionDelta = Number(migrationVersion(left)) - Number(migrationVersion(right));
    return versionDelta || left.localeCompare(right);
  });
}

export function assertUniqueMigrationVersions(files) {
  const versions = new Map();
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

export function isMigrationApplied(filename, applied) {
  const identity = migrationId(filename);
  const legacyVersion = migrationVersion(filename);

  return applied.some(
    (migration) =>
      migration.name === filename ||
      migration.version === identity ||
      // Pre-repair runners stored only the numeric prefix. The catalog rejects
      // duplicate prefixes, so this compatibility path is unambiguous.
      migration.version === legacyVersion,
  );
}

export function readMigrationFiles(migrationsDir) {
  const files = sortMigrationFiles(
    readdirSync(migrationsDir).filter((filename) => filename.endsWith(".sql")),
  );
  assertUniqueMigrationVersions(files);
  return files;
}
