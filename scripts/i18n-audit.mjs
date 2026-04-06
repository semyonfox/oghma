import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC_ROOT = 'src';
const LOCALES_DIR = 'src/locales';
const BASE_LOCALE = 'en.json';
const LOCALE_IGNORE = new Set(['STRINGS_MAPPING_EN_FR.json']);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function extractUsedKeys(files) {
  const keys = new Set();
  const directCall = /\bt\(\s*(["'`])([^"'`\n]+)\1/g;
  const arrayCall = /\bt\(\s*\[\s*(["'`])([^"'`\n]+)\1\s*\]/g;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    let match;
    while ((match = directCall.exec(source)) !== null) {
      const key = match[2].trim();
      if (/^[A-Za-z0-9_.:-]+(?:\.{3})?$/.test(key)) {
        keys.add(key);
      }
    }

    while ((match = arrayCall.exec(source)) !== null) {
      const key = match[2].trim();
      if (/^[A-Za-z0-9_.:-]+(?:\.{3})?$/.test(key)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

function readLocale(file) {
  return JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
}

function printList(title, values, limit = 12) {
  if (values.length === 0) return;
  console.error(`- ${title}: ${values.length}`);
  for (const value of values.slice(0, limit)) {
    console.error(`  - ${value}`);
  }
  if (values.length > limit) {
    console.error(`  - ...and ${values.length - limit} more`);
  }
}

function main() {
  const localeFiles = readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.json') && !LOCALE_IGNORE.has(f))
    .sort();

  if (!localeFiles.includes(BASE_LOCALE)) {
    console.error(`[i18n:audit] Missing base locale ${BASE_LOCALE}`);
    process.exit(1);
  }

  const baseLocale = readLocale(BASE_LOCALE);
  const baseKeys = Object.keys(baseLocale).sort();

  let hasError = false;

  const sourceFiles = walk(SRC_ROOT);
  const usedKeys = [...extractUsedKeys(sourceFiles)].sort();
  const usedMissingFromBase = usedKeys.filter((key) => !(key in baseLocale));
  if (usedMissingFromBase.length > 0) {
    hasError = true;
    console.error('[i18n:audit] Keys used in code but missing from en.json');
    printList('missing', usedMissingFromBase);
  }

  for (const localeFile of localeFiles) {
    const locale = readLocale(localeFile);
    const localeKeys = Object.keys(locale).sort();
    const missing = baseKeys.filter((key) => !(key in locale));
    const extra = localeKeys.filter((key) => !(key in baseLocale));

    if (missing.length > 0 || extra.length > 0) {
      hasError = true;
      console.error(`[i18n:audit] Locale mismatch: ${localeFile}`);
      printList('missing', missing);
      printList('extra', extra);
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log(`[i18n:audit] OK: ${localeFiles.length} locales, ${baseKeys.length} keys, ${usedKeys.length} used keys checked`);
}

main();
