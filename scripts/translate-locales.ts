// Batch-translates all untranslated strings in locale files.
// Usage: node --experimental-strip-types scripts/translate-locales.ts

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

// keys containing interpolation placeholders - translate but preserve placeholders
const PLACEHOLDER_RE = /\{[^}]+\}/g;

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  // google-translate-api-x supports batch translation
  const results = await translate(texts, { from: 'en', to: targetLang });
  if (Array.isArray(results)) {
    return results.map((result) => result.text);
  }
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

    // find untranslated keys (value same as English or missing)
    const toTranslate: { key: string; text: string }[] = [];
    for (const key of enKeys) {
      if (SKIP_KEYS.has(key)) continue;
      const enVal = en[key];
      const locVal = locale[key];
      // untranslated if missing or same as english
      if (!locVal || locVal === enVal) {
        toTranslate.push({ key, text: enVal });
      }
    }

    if (toTranslate.length === 0) {
      console.log(`${locFile}: already fully translated`);
      continue;
    }

    console.log(`${locFile} (${gtLang}): translating ${toTranslate.length} strings...`);

    // batch in chunks of 50 to avoid rate limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const texts = batch.map((item) => item.text);

      try {
        const translated = await translateBatch(texts, gtLang);

        for (let j = 0; j < batch.length; j++) {
          let result = translated[j]!;
          const original = batch[j]!.text;

          // restore interpolation placeholders that may have been mangled
          const originalPlaceholders = original.match(PLACEHOLDER_RE);
          if (originalPlaceholders) {
            // try to find and restore placeholders
            for (const ph of originalPlaceholders) {
              // if the placeholder was translated/mangled, try to find it
              const varName = ph.slice(1, -1); // e.g. "year" from "{year}"
              // common mangling patterns
              const patterns = [
                new RegExp(`\\{\\s*${varName}\\s*\\}`, "gi"),
                new RegExp(`\\$\\{\\s*${varName}\\s*\\}`, "gi"),
              ];
              let found = false;
              for (const pat of patterns) {
                if (pat.test(result)) {
                  result = result.replace(pat, ph);
                  found = true;
                  break;
                }
              }
              // if placeholder is completely gone, append it or check harder
              if (!found && !result.includes(ph)) {
                // try to find the translated variable name in the result
                // Only verify that the placeholder exists.
                result = result.replace(/\{[^}]*\}/g, ph);
              }
            }
          }

          locale[batch[j]!.key] = result;
        }

        process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toTranslate.length)}/${toTranslate.length}\r`);
      } catch (error) {
        console.error(`  Error at batch ${i}: ${errorMessage(error)}`);
        // wait and retry once
        await sleep(5000);
        try {
          const translated = await translateBatch(texts, gtLang);
          for (let j = 0; j < batch.length; j++) {
            locale[batch[j]!.key] = translated[j]!;
          }
        } catch (retryError) {
          console.error(`  Retry failed: ${errorMessage(retryError)}, skipping batch`);
        }
      }

      // small delay between batches to be nice to the API
      if (i + BATCH_SIZE < toTranslate.length) {
        await sleep(1500);
      }
    }

    // sort and write back
    const sorted: Locale = {};
    for (const k of Object.keys(locale).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
      sorted[k] = locale[k];
    }
    writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`\n${locFile}: done, wrote ${Object.keys(sorted).length} keys`);

    // delay between locales
    await sleep(2000);
  }

  console.log("\nAll locales translated!");
}

main().catch((error: unknown) => console.error(error));
