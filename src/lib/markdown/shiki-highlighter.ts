import type { HighlighterCore, LanguageInput, ThemedToken } from "shiki/core";

export type HighlightedCode = {
  tokens: ThemedToken[][];
  lang: string;
  theme: string;
};

const MAX_CACHE_ENTRIES = 100;
const DEFAULT_THEME = "github-dark";

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shellscript",
  cjs: "javascript",
  console: "shellscript",
  env: "dotenv",
  h: "c",
  html: "html",
  js: "javascript",
  jsx: "jsx",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  sh: "shellscript",
  shell: "shellscript",
  ts: "typescript",
  tsx: "tsx",
  yml: "yaml",
};

const LANGUAGE_LOADERS = {
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
} satisfies Record<string, () => Promise<{ default: LanguageInput }>>;

type CuratedLanguage = keyof typeof LANGUAGE_LOADERS;

const cache = new Map<string, Promise<HighlightedCode>>();
let highlighterPromise: Promise<HighlighterCore> | undefined;

function normalizeLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase().replace(/^language-/, "");
  if (!normalized || normalized === "text" || normalized === "txt") return "plaintext";
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function isCuratedLanguage(lang: string): lang is CuratedLanguage {
  return lang in LANGUAGE_LOADERS;
}

function hashCode(code: string) {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function remember(key: string, value: Promise<HighlightedCode>) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  return value;
}

async function getHighlighter() {
  highlighterPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/github-dark.mjs"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }, theme]) =>
    createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      themes: [theme.default],
      langs: [],
    }),
  );

  return highlighterPromise;
}

async function ensureLanguage(highlighter: HighlighterCore, lang: string) {
  if (lang === "plaintext") return "plaintext";
  if (!isCuratedLanguage(lang)) return "plaintext";
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    const registration = await LANGUAGE_LOADERS[lang]().then((mod) => mod.default);
    await highlighter.loadLanguage(registration);
  }
  return lang;
}

export function highlightCode(
  code: string,
  language?: string,
  theme = DEFAULT_THEME,
): Promise<HighlightedCode> {
  const requestedLang = normalizeLanguage(language);
  const key = `${theme}:${requestedLang}:${hashCode(code)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const highlighted = getHighlighter().then(async (highlighter) => {
    const lang = await ensureLanguage(highlighter, requestedLang);
    const result = highlighter.codeToTokens(code, { lang, theme });
    return { tokens: result.tokens, lang, theme };
  });

  return remember(key, highlighted);
}

export function __clearShikiCacheForTests() {
  cache.clear();
}
