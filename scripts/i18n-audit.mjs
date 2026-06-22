import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC_ROOT = 'src';
const LOCALES_DIR = 'src/locales';
const BASE_LOCALE = 'en.json';
const LOCALE_IGNORE = new Set(['STRINGS_MAPPING_EN_FR.json']);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const KEY_TOKEN_RE = /^[A-Za-z0-9_.:-]+(?:\.{3})?$/;
const PLACEHOLDER_RE = /\$\{[^{}]+\}|\{[^{}]+\}/g;
const SAMPLE_LIMIT = 12;

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

function extractPlaceholders(value) {
  const matches = String(value).matchAll(PLACEHOLDER_RE);
  const vars = new Set();
  for (const match of matches) {
    const token = match[0];
    const inner = token.startsWith('${')
      ? token.slice(2, -1).trim()
      : token.slice(1, -1).trim();
    if (inner.length > 0) {
      vars.add(inner);
    }
  }
  return [...vars].sort();
}

function placeholdersMismatch(baseValue, localeValue) {
  const base = extractPlaceholders(baseValue);
  const locale = extractPlaceholders(localeValue);
  if (base.length !== locale.length) return true;
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] !== locale[i]) return true;
  }
  return false;
}

function isLikelyUntranslated(baseValue, localeValue, key) {
  if (baseValue !== localeValue) return false;
  if (baseValue.length < 4) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(baseValue)) return false;
  if (key === baseValue) return false;
  if (/^\{\{.*\}\}$/.test(baseValue)) return false;
  return true;
}

function printList(title, values, limit = SAMPLE_LIMIT) {
  if (values.length === 0) return;
  console.error(`- ${title}: ${values.length}`);
  for (const value of values.slice(0, limit)) {
    console.error(`  - ${value}`);
  }
  if (values.length > limit) {
    console.error(`  - ...and ${values.length - limit} more`);
  }
}

function extractUsedKeys(files) {
  const staticKeys = new Set();
  const dynamicKeys = new Set();
  let templateInterpolations = 0;

  const directCall = /\bt\(\s*(["'`])([^"'`\n]+)\1/g;
  const arrayCall = /\bt\(\s*\[\s*(["'`])([^"'`\n]+)\1\s*\]/g;
  const templateCall = /\bt\(\s*`[^`]*\$\{[^`]*\}[^`]*`/g;
  const variableCall = /\bt\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)?)/g;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    let match;
    while ((match = directCall.exec(source)) !== null) {
      const key = match[2].trim();
      if (KEY_TOKEN_RE.test(key)) {
        staticKeys.add(key);
      }
    }

    while ((match = arrayCall.exec(source)) !== null) {
      const key = match[2].trim();
      if (KEY_TOKEN_RE.test(key)) {
        staticKeys.add(key);
      }
    }

    while ((match = templateCall.exec(source)) !== null) {
      templateInterpolations += 1;
      const snippet = match[0].slice(0, 120);
      dynamicKeys.add(`template:${snippet}...`);
    }

    while ((match = variableCall.exec(source)) !== null) {
      const expr = match[1];
      if (!KEY_TOKEN_RE.test(expr)) {
        dynamicKeys.add(expr);
      }
    }
  }

  return { staticKeys, dynamicKeys, templateInterpolations };
}

function readLocale(file) {
  return JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
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
  let hasWarning = false;

  const sourceFiles = walk(SRC_ROOT);
  const extracted = extractUsedKeys(sourceFiles);
  const usedKeys = [...extracted.staticKeys].sort();
  const usedMissingFromBase = usedKeys.filter((key) => !(key in baseLocale));
  const unusedBaseKeys = baseKeys.filter((key) => !extracted.staticKeys.has(key));

  const warnings = [];
  const placeholderWarnings = [];
  const untranslatedWarnings = [];
  const strict = process.env.I18N_AUDIT_STRICT === '1';

  if (usedMissingFromBase.length > 0) {
    hasError = true;
    console.error('[i18n:audit] Keys used in code but missing from en.json');
    printList('missing', usedMissingFromBase);
  }

  if (unusedBaseKeys.length > 0) {
    hasWarning = true;
    console.error('[i18n:audit] Potentially unused keys in en.json (not referenced as t("..."))');
    printList('unused', unusedBaseKeys);
  }

  if (extracted.templateInterpolations > 0 || extracted.dynamicKeys.size > 0) {
    hasWarning = true;
    console.error('[i18n:audit] Dynamic i18n key usage detected (not 100% statically auditable)');
    if (extracted.templateInterpolations > 0) {
      warnings.push(`template interpolations used: ${extracted.templateInterpolations}`);
    }
    if (extracted.dynamicKeys.size > 0) {
      warnings.push(...extracted.dynamicKeys);
    }
    printList('examples', warnings);
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
      continue;
    }

    for (const key of baseKeys) {
      const baseValue = baseLocale[key];
      const localeValue = locale[key];
      if (typeof baseValue === 'string' && typeof localeValue === 'string') {
        if (isLikelyUntranslated(baseValue, localeValue, key)) {
          untranslatedWarnings.push(`${localeFile} :: ${key}`);
        }
        if ((baseValue.includes('{') || baseValue.includes('${')) && placeholdersMismatch(baseValue, localeValue)) {
          placeholderWarnings.push(`${localeFile} :: ${key}`);
        }
      }
    }
  }

  if (untranslatedWarnings.length > 0) {
    hasWarning = true;
    console.error('[i18n:audit] Possible untranslated entries (locale value equals base)');
    printList('same-as-en', untranslatedWarnings, 24);
  }

  if (placeholderWarnings.length > 0) {
    hasWarning = true;
    console.error('[i18n:audit] Placeholder mismatch: base and locale interpolation variables differ');
    printList('mismatch', placeholderWarnings, 24);
  }

  if (strict && (hasWarning || hasError)) {
    hasError = true;
  }

  if (hasError) {
    process.exit(1);
  }

  const status = hasWarning ? 'OK (warnings)' : 'OK';
  console.log(
    `[i18n:audit] ${status}: ${localeFiles.length} locales, ${baseKeys.length} keys, ${usedKeys.length} statically-used keys checked`,
  );
}

main();
