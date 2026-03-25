// adapted from notea: https://github.com/QingWei-Li/notea
// original file: scripts/extract-i18n.js
//
// extracts i18n keys from source files and updates locale JSON files
// usage: node scripts/extract-i18n.js

const extract = require('i18n-extract');
const { resolve, extname } = require('path');
const { sortBy, forEach } = require('lodash');
const { readdirSync, readFileSync, writeFileSync } = require('fs');

console.log(`[i18n] Extracting keys`);

// extract from all tsx files in the web app
const keys = extract.extractFromFiles([resolve(__dirname, '../apps/web/**/*.tsx')], {
  marker: 't',
  parser: 'typescript',
});

const localesPath = resolve(__dirname, '../apps/web/src/locales');
const files = readdirSync(localesPath);

forEach(files, (file) => {
  if (extname(file) === '.json') {
    const filePath = resolve(localesPath, file);
    const text = readFileSync(filePath).toString() || `{}`;
    const rawLocale = JSON.parse(text);
    const locale = {};

    forEach(sortBy(keys, 'key'), ({ key }) => {
      if (!locale[key]) {
        locale[key] = rawLocale[key] || key;
      }
    });

    writeFileSync(filePath, JSON.stringify(locale, null, '  '));
    console.log(`[i18n] Generated ${file}`);
  }
});
