// Batch-translates untranslated strings in locale files.
// The translator is not a project dependency, so install it for the run only:
//   npm install --no-save google-translate-api-x
//   node --experimental-strip-types scripts/translate-locales.ts
// Review the diff afterwards; machine translations are a first draft.

import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type TranslationResult = { text: string };
type Translator = (
  texts: string[],
  options: { from: string; to: string },
) => Promise<TranslationResult | TranslationResult[]>;
type Locale = Record<string, string>;

const LOCALES_DIR = "./src/locales";

// locale file name -> translator language code
const LOCALE_MAP: Record<string, string> = {
  ar: "ar",
  "de-DE": "de",
  "es-ES": "es",
  "fr-FR": "fr",
  ga: "ga",
  hi: "hi",
  "it-IT": "it",
  "nl-NL": "nl",
  "ru-RU": "ru",
  "sv-SE": "sv",
  "zh-CN": "zh-CN",
};

// keys that should NOT be translated (brand names, technical terms, codes)
const SKIP_KEYS = new Set([
  "OghmaNotes", "OghmaNotes Logo", "GitHub", "Google",
  "Facebook", "Instagram", "LinkedIn", "YouTube", "X", "SocsBoard",
  "HTML", "UTC", "ID", "ID:", "M", "S",
  "john@example.com", "universityofgalway.instructure.com",
  "NUI Galway", "Trinity College Dublin", "University College Dublin",
  "University College Cork", "Dublin City University",
  "John", "Doe", "RAG Chat", "Canvas",
]);

const PLACEHOLDER_RE = /\$?\{\s*([^{}]+?)\s*\}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadTranslator(): Translator {
  const require = createRequire(import.meta.url);
  let module: unknown;
  try {
    module = require("google-translate-api-x");
  } catch {
    throw new Error(
      "google-translate-api-x is not installed; run `npm install --no-save google-translate-api-x` first",
    );
  }
  const candidate =
    typeof module === "function"
      ? module
      : isRecord(module) && typeof module.default === "function"
        ? module.default
        : null;

  if (!candidate) {
    throw new Error("google-translate-api-x did not expose a translation function");
  }
  return candidate as Translator;
}

function parseLocale(value: unknown, filePath: string): Locale {
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`${filePath} must be a flat string map`);
  }
  return value as Locale;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Put the original `{name}` placeholders back into a machine translation.
 * Translators often add spaces, a `$`, or translate the variable name. When the
 * placeholder count no longer matches, the translation is unusable and the
 * caller keeps the English text instead of writing a broken template.
 */
export function restorePlaceholders(original: string, translated: string): string | null {
  const expected = [...original.matchAll(PLACEHOLDER_RE)].map((match) => `{${match[1]}}`);
  if (!expected.length) return translated;

  const found = [...translated.matchAll(PLACEHOLDER_RE)];
  if (found.length !== expected.length) return null;

  const foundNames = found.map((match) => `{${match[1]}}`);
  const sameNames = [...foundNames].sort().join() === [...expected].sort().join();
  let index = 0;
  return translated.replace(PLACEHOLDER_RE, (_token, name: string) => {
    // matching names keep their own position, which preserves word order
    // changes; renamed placeholders can only be mapped back by position
    const restored = sameNames ? `{${name}}` : expected[index];
    index += 1;
    return restored;
  });
}

/** Rewrite a locale in the base locale's key order so diffs stay line-local. */
export function orderLikeBase(base: Locale, locale: Locale): Locale {
  const ordered: Locale = {};
  for (const key of Object.keys(base)) {
    if (key in locale) ordered[key] = locale[key];
  }
  for (const key of Object.keys(locale)) {
    if (!(key in ordered)) ordered[key] = locale[key];
  }
  return ordered;
}

async function translateBatch(
  translate: Translator,
  texts: string[],
  targetLang: string,
): Promise<string[]> {
  const results = await translate(texts, { from: "en", to: targetLang });
  return Array.isArray(results) ? results.map((result) => result.text) : [results.text];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertEveryLocaleMapped(): void {
  const unmapped = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".json") && file !== "en.json")
    .map((file) => file.slice(0, -".json".length))
    .filter((name) => !(name in LOCALE_MAP));
  if (unmapped.length) {
    throw new Error(`no translator language for: ${unmapped.join(", ")}`);
  }
}

async function main() {
  assertEveryLocaleMapped();
  const translate = loadTranslator();
  const en = parseLocale(JSON.parse(readFileSync(`${LOCALES_DIR}/en.json`, "utf8")) as unknown, "en.json");
  let skipped = 0;

  for (const [locFile, gtLang] of Object.entries(LOCALE_MAP)) {
    const filePath = `${LOCALES_DIR}/${locFile}.json`;
    const locale = parseLocale(JSON.parse(readFileSync(filePath, "utf8")) as unknown, filePath);

    // untranslated if missing or still the English value
    const toTranslate = Object.keys(en)
      .filter((key) => !SKIP_KEYS.has(key) && (!locale[key] || locale[key] === en[key]))
      .map((key) => ({ key, text: en[key] }));

    if (toTranslate.length === 0) {
      console.log(`${locFile}: already fully translated`);
      continue;
    }

    console.log(`${locFile} (${gtLang}): translating ${toTranslate.length} strings...`);

    const BATCH_SIZE = 50;
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const texts = batch.map((item) => item.text);

      let translated: string[] | null = null;
      try {
        translated = await translateBatch(translate, texts, gtLang);
      } catch (error) {
        console.error(`  Error at batch ${i}: ${errorMessage(error)}`);
        await sleep(5000);
        try {
          translated = await translateBatch(translate, texts, gtLang);
        } catch (retryError) {
          console.error(`  Retry failed: ${errorMessage(retryError)}, skipping batch`);
        }
      }

      batch.forEach((item, index) => {
        const candidate = translated?.[index];
        const restored = candidate === undefined ? null : restorePlaceholders(item.text, candidate);
        if (restored === null) {
          skipped += 1;
          locale[item.key] ??= item.text;
          return;
        }
        locale[item.key] = restored;
      });

      process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toTranslate.length)}/${toTranslate.length}\r`);
      if (i + BATCH_SIZE < toTranslate.length) await sleep(1500);
    }

    writeFileSync(filePath, JSON.stringify(orderLikeBase(en, locale), null, 2) + "\n");
    console.log(`\n${locFile}: done`);
    await sleep(2000);
  }

  console.log(
    skipped
      ? `\nDone. ${skipped} strings kept in English because the translation was missing or lost a placeholder.`
      : "\nAll locales translated!",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
