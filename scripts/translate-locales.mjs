// batch-translates all untranslated strings in locale files
// uses google-translate-api-x (free, no API key needed)
// usage: node scripts/translate-locales.mjs

import { readFileSync, writeFileSync } from 'fs';
import translate from 'google-translate-api-x';

const LOCALE_MAP = {
  'ar':    'ar',
  'de-DE': 'de',
  'es-ES': 'es',
  'fr-FR': 'fr',
  'ga':    'ga',
  'hi':    'hi',
  'it-IT': 'it',
  'nl-NL': 'nl',
  'ru-RU': 'ru',
  'sv-SE': 'sv',
  'zh-CN': 'zh-CN',
};

// keys that should NOT be translated (brand names, technical terms, codes)
const SKIP_KEYS = new Set([
  'OghmaNotes', 'OghmaNotes Logo', 'GitHub', 'Google', 'Microsoft', 'Apple',
  'Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'X', 'SocsBoard',
  'HTML', 'UTC', 'ID', 'ID:', 'M', 'S',
  'john@example.com', 'dcu.instructure.com',
  'NUI Galway', 'Trinity College Dublin', 'University College Dublin',
  'University College Cork', 'Dublin City University',
  'John', 'Doe', 'RAG Chat', 'Canvas',
]);

// keys containing interpolation placeholders - translate but preserve placeholders
const PLACEHOLDER_RE = /\{[^}]+\}/g;

async function translateBatch(texts, targetLang) {
  // google-translate-api-x supports batch translation
  const results = await translate(texts, { from: 'en', to: targetLang });
  if (Array.isArray(results)) {
    return results.map(r => r.text);
  }
  return [results.text];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const en = JSON.parse(readFileSync('./src/locales/en.json', 'utf8'));
  const enKeys = Object.keys(en);

  for (const [locFile, gtLang] of Object.entries(LOCALE_MAP)) {
    const filePath = `./src/locales/${locFile}.json`;
    const locale = JSON.parse(readFileSync(filePath, 'utf8'));

    // find untranslated keys (value same as English or missing)
    const toTranslate = [];
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
      const texts = batch.map(b => b.text);

      try {
        const translated = await translateBatch(texts, gtLang);

        for (let j = 0; j < batch.length; j++) {
          let result = translated[j];
          const original = batch[j].text;

          // restore interpolation placeholders that may have been mangled
          const originalPlaceholders = original.match(PLACEHOLDER_RE);
          if (originalPlaceholders) {
            // try to find and restore placeholders
            for (const ph of originalPlaceholders) {
              // if the placeholder was translated/mangled, try to find it
              const varName = ph.slice(1, -1); // e.g. "year" from "{year}"
              // common mangling patterns
              const patterns = [
                new RegExp(`\\{\\s*${varName}\\s*\\}`, 'gi'),
                new RegExp(`\\$\\{\\s*${varName}\\s*\\}`, 'gi'),
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
                // just ensure the placeholder exists
                result = result.replace(/\{[^}]*\}/g, ph);
              }
            }
          }

          locale[batch[j].key] = result;
        }

        process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toTranslate.length)}/${toTranslate.length}\r`);
      } catch (err) {
        console.error(`  Error at batch ${i}: ${err.message}`);
        // wait and retry once
        await sleep(5000);
        try {
          const translated = await translateBatch(texts, gtLang);
          for (let j = 0; j < batch.length; j++) {
            locale[batch[j].key] = translated[j];
          }
        } catch (err2) {
          console.error(`  Retry failed: ${err2.message}, skipping batch`);
        }
      }

      // small delay between batches to be nice to the API
      if (i + BATCH_SIZE < toTranslate.length) {
        await sleep(1500);
      }
    }

    // sort and write back
    const sorted = {};
    for (const k of Object.keys(locale).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
      sorted[k] = locale[k];
    }
    writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`\n${locFile}: done, wrote ${Object.keys(sorted).length} keys`);

    // delay between locales
    await sleep(2000);
  }

  console.log('\nAll locales translated!');
}

main().catch(console.error);
