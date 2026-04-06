// extracts i18n keys from source files and updates locale JSON files
// usage: node scripts/extract-i18n.js

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const SRC_ROOT = 'src';
const LOCALES_DIR = 'src/locales';
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const LOCALE_IGNORE = new Set(['STRINGS_MAPPING_EN_FR.json']);

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

  return [...keys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function sortKeys(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((key) => [key, obj[key]]),
  );
}

console.log('[i18n] Extracting keys');

const sourceFiles = walk(SRC_ROOT);
const keys = extractUsedKeys(sourceFiles);

const localeFiles = readdirSync(LOCALES_DIR)
  .filter((file) => extname(file) === '.json' && !LOCALE_IGNORE.has(file))
  .sort();

for (const file of localeFiles) {
  const filePath = join(LOCALES_DIR, file);
  const rawLocale = JSON.parse(readFileSync(filePath, 'utf8'));
  const locale = {};

  for (const key of keys) {
    locale[key] = rawLocale[key] ?? key;
  }

  writeFileSync(filePath, `${JSON.stringify(sortKeys(locale), null, 2)}\n`);
  console.log(`[i18n] Generated ${file}`);
}
