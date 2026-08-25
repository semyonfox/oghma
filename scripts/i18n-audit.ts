import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const BASE_LOCALE = "en.json";
const LOCALE_IGNORE = new Set(["STRINGS_MAPPING_EN_FR.json"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const PLACEHOLDER_RE = /\$\{[^{}]+\}|\{[^{}]+\}/g;
const SAMPLE_LIMIT = 12;

type LocaleDictionary = Record<string, unknown>;

interface AuditOptions {
  sourceRoot?: string;
  localesDir?: string;
}

interface AuditReport {
  errors: string[];
  localeFiles: string[];
  baseKeyCount: number;
  staticKeyCount: number;
  dynamicCallCount: number;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name !== "node_modules" &&
        entry.name !== ".next" &&
        entry.name !== "__tests__"
      ) {
        walk(full, out);
      }
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(full);
  }
  return out.sort();
}

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function literalKeys(argument: ts.Expression): string[] | null {
  if (ts.isStringLiteralLike(argument)) return [argument.text];
  if (!ts.isArrayLiteralExpression(argument)) return null;

  const keys = argument.elements.map((element) =>
    ts.isStringLiteralLike(element) ? element.text : null,
  );
  return keys.every((key) => key !== null) ? keys : null;
}

function extractUsedKeys(files: string[]) {
  const staticKeys = new Set<string>();
  const dynamicCalls: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file),
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments[0]
      ) {
        const keys = literalKeys(node.arguments[0]);
        if (keys) {
          keys.forEach((key) => staticKeys.add(key));
        } else {
          const position = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
          dynamicCalls.push(`${file}:${position.line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(parsed);
  }

  return { staticKeys, dynamicCalls };
}

function extractPlaceholders(value: string): string[] {
  const vars = new Set<string>();
  for (const match of String(value).matchAll(PLACEHOLDER_RE)) {
    const token = match[0];
    const inner = token.startsWith("${")
      ? token.slice(2, -1).trim()
      : token.slice(1, -1).trim();
    if (inner) vars.add(inner);
  }
  return [...vars].sort();
}

function placeholdersMismatch(baseValue: string, localeValue: string): boolean {
  const base = extractPlaceholders(baseValue);
  const locale = extractPlaceholders(localeValue);
  return base.length !== locale.length || base.some((value, index) => value !== locale[index]);
}

function readLocale(filePath: string): LocaleDictionary {
  const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return value as LocaleDictionary;
}

function addList(errors: string[], label: string, values: string[]): void {
  if (!values.length) return;
  const visible = values.slice(0, SAMPLE_LIMIT).join(", ");
  const remainder = values.length > SAMPLE_LIMIT ? ` (+${values.length - SAMPLE_LIMIT} more)` : "";
  errors.push(`${label}: ${visible}${remainder}`);
}

/**
 * Checks runtime-relevant locale contracts. It deliberately does not try to
 * infer every catalog value's reachability: article and navigation catalogs
 * pass values to `t` dynamically, so a static "unused" list would be noisy.
 */
export function auditI18n({
  sourceRoot = process.env.I18N_SOURCE_ROOT ?? "src",
  localesDir = process.env.I18N_LOCALES_DIR ?? "src/locales",
}: AuditOptions = {}): AuditReport {
  const localeFiles = readdirSync(localesDir)
    .filter((file) => file.endsWith(".json") && !LOCALE_IGNORE.has(file))
    .sort();
  const errors: string[] = [];

  if (!localeFiles.includes(BASE_LOCALE)) {
    return {
      errors: [`missing base locale ${join(localesDir, BASE_LOCALE)}`],
      localeFiles,
      baseKeyCount: 0,
      staticKeyCount: 0,
      dynamicCallCount: 0,
    };
  }

  const baseLocale = readLocale(join(localesDir, BASE_LOCALE));
  const baseKeys = Object.keys(baseLocale).sort();
  const { staticKeys, dynamicCalls } = extractUsedKeys(walk(sourceRoot));
  addList(
    errors,
    "literal keys missing from en.json",
    [...staticKeys].filter((key) => !(key in baseLocale)).sort(),
  );

  for (const key of baseKeys) {
    if (typeof baseLocale[key] !== "string") {
      errors.push(`en.json :: ${key} must be a string`);
    }
  }

  for (const localeFile of localeFiles) {
    if (localeFile === BASE_LOCALE) continue;
    const locale = readLocale(join(localesDir, localeFile));
    const localeKeys = Object.keys(locale).sort();
    addList(
      errors,
      `${localeFile} missing keys`,
      baseKeys.filter((key) => !(key in locale)),
    );
    addList(
      errors,
      `${localeFile} extra keys`,
      localeKeys.filter((key) => !(key in baseLocale)),
    );

    for (const key of baseKeys) {
      const baseValue = baseLocale[key];
      const localeValue = locale[key];
      if (typeof localeValue !== "string") {
        errors.push(`${localeFile} :: ${key} must be a string`);
        continue;
      }
      if (typeof baseValue !== "string") continue;
      if (placeholdersMismatch(baseValue, localeValue)) {
        errors.push(`${localeFile} :: ${key} has different interpolation variables`);
      }
    }
  }

  return {
    errors,
    localeFiles,
    baseKeyCount: baseKeys.length,
    staticKeyCount: staticKeys.size,
    dynamicCallCount: dynamicCalls.length,
  };
}

function main() {
  try {
    const report = auditI18n();
    if (report.errors.length) {
      console.error("[i18n:audit] Failed");
      report.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 1;
      return;
    }
    console.log(
      `[i18n:audit] OK: ${report.localeFiles.length} locales, ${report.baseKeyCount} keys, ${report.staticKeyCount} literal source keys, ${report.dynamicCallCount} dynamic source calls`,
    );
  } catch (error) {
    console.error(`[i18n:audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
