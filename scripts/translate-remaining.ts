// Force-translates remaining English-identical locale strings.
// Usage: node --experimental-strip-types scripts/translate-remaining.ts

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

type TranslationResult = { text: string };
type Translator = (
  texts: string[],
  options: { from: string; to: string },
) => Promise<TranslationResult | TranslationResult[]>;
type Locale = Record<string, string>;

const require = createRequire(import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadTranslator(): Translator {
  const module: unknown = require("google-translate-api-x");
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

const translate = loadTranslator();

const LOCALE_MAP = {
  ar: "ar",
  "de-DE": "de",
  "es-ES": "es",
  "fr-FR": "fr",
  ga: "ga",
  hi: "hi",
  "it-IT": "it",
  "nl-NL": "nl",
  ru: "ru",
  "sv-SE": "sv",
  "zh-CN": "zh-CN",
};

// only skip things that truly cannot/should not be translated
const SKIP_KEYS = new Set([
  "OghmaNotes", "OghmaNotes Logo", "GitHub", "SocsBoard",
  "john@example.com", "universityofgalway.instructure.com",
  "NUI Galway", "Trinity College Dublin", "University College Dublin",
  "University College Cork", "Dublin City University",
  "David Kim", "Emma Rodriguez", "Jessica Walsh", "Marcus Johnson",
  "John", "Doe", "ID", "ID:", "M", "S", "Logo",
]);

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  const results = await translate(texts, { from: "en", to: targetLang });
  if (Array.isArray(results)) return results.map((result) => result.text);
  return [results.text];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const en = parseLocale(JSON.parse(readFileSync("./src/locales/en.json", "utf8")) as unknown, "en.json");
  const enKeys = Object.keys(en);

  for (const [locFile, gtLang] of Object.entries(LOCALE_MAP)) {
    const filePath = `./src/locales/${locFile}.json`;
    const locale = parseLocale(JSON.parse(readFileSync(filePath, "utf8")) as unknown, filePath);

    const toTranslate: { key: string; text: string }[] = [];
    for (const key of enKeys) {
      if (SKIP_KEYS.has(key)) continue;
      if (locale[key] === en[key]) {
        toTranslate.push({ key, text: en[key] });
      }
    }

    if (toTranslate.length === 0) {
      console.log(`${locFile}: fully translated`);
      continue;
    }

    console.log(`${locFile} (${gtLang}): force-translating ${toTranslate.length} remaining strings...`);

    const BATCH_SIZE = 50;
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const texts = batch.map((item) => item.text);

      try {
        const translated = await translateBatch(texts, gtLang);
        for (let j = 0; j < batch.length; j++) {
          const result = translated[j]!;
          // only update if translation is actually different
          if (result && result !== batch[j]!.text) {
            locale[batch[j]!.key] = result;
          }
          // if google returns the same word, it IS the same in that language - leave it
        }
        process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toTranslate.length)}/${toTranslate.length}\r`);
      } catch (error) {
        console.error(`  Error: ${errorMessage(error)}`);
        await sleep(5000);
      }

      if (i + BATCH_SIZE < toTranslate.length) await sleep(1500);
    }

    const sorted: Locale = {};
    for (const k of Object.keys(locale).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
      sorted[k] = locale[k];
    }
    writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`\n${locFile}: done`);
    await sleep(2000);
  }

  console.log("\nDone!");
}

main().catch((error: unknown) => console.error(error));
