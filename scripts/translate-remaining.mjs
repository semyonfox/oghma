// force-translates ALL remaining English-identical strings in locale files
// only skips truly untranslatable items (proper nouns, emails, single chars)

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

// only skip things that truly cannot/should not be translated
const SKIP_KEYS = new Set([
  'OghmaNotes', 'OghmaNotes Logo', 'GitHub', 'SocsBoard',
  'john@example.com', 'dcu.instructure.com',
  'NUI Galway', 'Trinity College Dublin', 'University College Dublin',
  'University College Cork', 'Dublin City University',
  'David Kim', 'Emma Rodriguez', 'Jessica Walsh', 'Marcus Johnson',
  'John', 'Doe', 'ID', 'ID:', 'M', 'S', 'Logo',
]);

async function translateBatch(texts, targetLang) {
  const results = await translate(texts, { from: 'en', to: targetLang });
  if (Array.isArray(results)) return results.map(r => r.text);
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

    const toTranslate = [];
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
      const texts = batch.map(b => b.text);

      try {
        const translated = await translateBatch(texts, gtLang);
        for (let j = 0; j < batch.length; j++) {
          const result = translated[j];
          // only update if translation is actually different
          if (result && result !== batch[j].text) {
            locale[batch[j].key] = result;
          }
          // if google returns the same word, it IS the same in that language - leave it
        }
        process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toTranslate.length)}/${toTranslate.length}\r`);
      } catch (err) {
        console.error(`  Error: ${err.message}`);
        await sleep(5000);
      }

      if (i + BATCH_SIZE < toTranslate.length) await sleep(1500);
    }

    const sorted = {};
    for (const k of Object.keys(locale).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
      sorted[k] = locale[k];
    }
    writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`\n${locFile}: done`);
    await sleep(2000);
  }

  console.log('\nDone!');
}

main().catch(console.error);
