import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_LOCALE = 'src/locales/en.json';
const SOURCE_GLOB = 'src/**/*.{js,jsx,ts,tsx}';
const SAMPLE_LIMIT = 20;

function walkFilesSummary(lines, limit = SAMPLE_LIMIT) {
  return lines.slice(0, limit).join('\n');
}

function printList(title, values, total, limit = SAMPLE_LIMIT) {
  if (values.length === 0) return;
  console.error(`- ${title}: ${total}`);
  console.error(walkFilesSummary(values, limit));
  if (values.length > limit) {
    console.error(`- ...and ${values.length - limit} more`);
  }
}

function expandForPluralAndContext(keys) {
  const expanded = new Set(keys);

  for (const key of keys) {
    const pluralMatch = key.match(/^(.+?)_(zero|one|two|few|many|other)$/);
    if (pluralMatch) {
      expanded.add(pluralMatch[1]);
    }

    const contextMatch = key.match(/^(.+)_context[A-Za-z0-9]+$/);
    if (contextMatch) {
      expanded.add(contextMatch[1]);
    }
  }

  return [...expanded];
}

function runParser() {
  const workDir = mkdtempSync(join(tmpdir(), 'i18n-parser-'));
  const outputPath = join(workDir, 'scan.json');
  const configPath = join(workDir, 'i18next-parser.config.js');

  const config = `
module.exports = {
  locales: ['en'],
  sort: true,
  namespace: false,
  defaultNamespace: 'translation',
  output: ${JSON.stringify(outputPath)},
  indentation: 2,
  keepRemoved: false,
  defaultValue: '',
  keySeparator: false,
  namespaceSeparator: false,
  lexers: {
    ts: ['JsxLexer'],
    tsx: ['JsxLexer'],
    js: ['JsxLexer'],
    jsx: ['JsxLexer'],
  },
};
`;

  writeFileSync(configPath, config);
  const result = spawnSync(
    'bunx',
    ['--bun', 'i18next-parser', '--config', configPath, SOURCE_GLOB],
    {
      encoding: 'utf8',
      shell: false,
      maxBuffer: 2_000_000,
      windowsHide: true,
    },
  );

  const outputLog = `${result.stdout || ''}\n${result.stderr || ''}`;
  const nonLiteralWarnings = outputLog
    .split('\n')
    .filter((line) => line.includes('Key is not a string literal'));

  const hasOutput = existsSync(outputPath);
  const raw = hasOutput ? readFileSync(outputPath, 'utf8') : '{}';

  rmSync(configPath);
  rmSync(workDir, { recursive: true, force: true });

  if (!hasOutput) {
    throw new Error(`i18next-parser did not produce output file: ${outputPath}`);
  }

  if (result.status !== 0) {
    // This parser version currently emits an exit error in some environments,
    // but still writes output. We tolerate that only when output is present.
    if (!process.env.I18N_PARSER_TOLERATE_ERRORS) {
      console.error(outputLog);
    }
  }

  return {
    extracted: JSON.parse(raw),
    nonLiteralWarnings,
    hadParserError: result.status !== 0,
  };
}

function compareKeys(baseKeys, extractedKeys) {
  const baseSet = new Set(baseKeys);
  const extractedSet = new Set(extractedKeys);

  const missingInBase = extractedKeys.filter((key) => !baseSet.has(key)).sort();
  const unusedInCode = baseKeys.filter((key) => !extractedSet.has(key)).sort();

  return { missingInBase, unusedInCode };
}

function main() {
  const baseLocale = JSON.parse(readFileSync(BASE_LOCALE, 'utf8'));
  const baseKeys = Object.keys(baseLocale).sort();

  const { extracted, nonLiteralWarnings, hadParserError } = runParser();
  const extractedKeys = expandForPluralAndContext(Object.keys(extracted)).sort();
  const { missingInBase, unusedInCode } = compareKeys(baseKeys, extractedKeys);

  const hasWarning = nonLiteralWarnings.length > 0 || missingInBase.length > 0 || unusedInCode.length > 0;

  console.log(
    `[i18n:bunx] extraction complete: ${extractedKeys.length} keys, ${baseKeys.length} en keys, ${nonLiteralWarnings.length} dynamic-key warnings`,
  );

  if (missingInBase.length > 0) {
    console.error('[i18n:bunx] Keys referenced in source but missing from en.json');
    printList('missingInEn', missingInBase, missingInBase.length);
  }

  if (unusedInCode.length > 0) {
    console.error('[i18n:bunx] en keys never referenced by parser extraction');
    printList('parserUnused', unusedInCode, unusedInCode.length);
  }

  if (nonLiteralWarnings.length > 0) {
    console.error('[i18n:bunx] Dynamic key warnings (not verifiable statically)');
    printList('nonLiteral', nonLiteralWarnings.map((line) => line.trim()), nonLiteralWarnings.length, 24);
  }

  if (hadParserError && process.env.I18N_PARSER_TOLERATE_ERRORS !== '0') {
    console.error('[i18n:bunx] parser exited non-zero but output was generated. Ignoring due known Bun runtime issue.');
  }

  if (hasWarning && process.env.I18N_AUDIT_STRICT === '1') {
    process.exit(1);
  }

  const status = hasWarning ? 'OK (warnings)' : 'OK';
  console.log(`[i18n:bunx] ${status}`);
}

main();
