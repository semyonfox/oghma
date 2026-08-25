// Extracts literal i18n keys from source files and refreshes locale JSON files.
// Usage: node --experimental-strip-types scripts/extract-i18n.ts

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const SRC_ROOT = "src";
const LOCALES_DIR = "src/locales";
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const LOCALE_IGNORE = new Set(["STRINGS_MAPPING_EN_FR.json"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLocale(value: unknown, filePath: string): Record<string, string> {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`Locale ${filePath} must be a flat string map`);
  }

  return value as Record<string, string>;
}

function walk(directory: string, out: string[] = []): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(fullPath, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

function extractUsedKeys(files: readonly string[]): string[] {
  const keys = new Set<string>();
  const directCall = /\bt\(\s*(["'`])([^"'`\n]+)\1/g;
  const arrayCall = /\bt\(\s*\[\s*(["'`])([^"'`\n]+)\1\s*\]/g;

  for (const file of files) {
    const source = readFileSync(file, "utf8");

    let match: RegExpExecArray | null;
    while ((match = directCall.exec(source)) !== null) {
      const key = match[2]!.trim();
      if (/^[A-Za-z0-9_.:-]+(?:\.{3})?$/.test(key)) {
        keys.add(key);
      }
    }

    while ((match = arrayCall.exec(source)) !== null) {
      const key = match[2]!.trim();
      if (/^[A-Za-z0-9_.:-]+(?:\.{3})?$/.test(key)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function sortKeys(locale: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(locale)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
      .map((key) => [key, locale[key]!]),
  );
}

console.log("[i18n] Extracting keys");

const sourceFiles = walk(SRC_ROOT);
const keys = extractUsedKeys(sourceFiles);

const localeFiles = readdirSync(LOCALES_DIR)
  .filter((file) => extname(file) === ".json" && !LOCALE_IGNORE.has(file))
  .sort();

for (const file of localeFiles) {
  const filePath = join(LOCALES_DIR, file);
  const locale = parseLocale(JSON.parse(readFileSync(filePath, "utf8")) as unknown, filePath);
  const refreshed: Record<string, string> = {};

  for (const key of keys) {
    refreshed[key] = locale[key] ?? key;
  }

  writeFileSync(filePath, `${JSON.stringify(sortKeys(refreshed), null, 2)}\n`);
  console.log(`[i18n] Generated ${file}`);
}
