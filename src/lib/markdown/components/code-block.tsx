"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

const SHIKI_THEME = "github-dark";
const plaintextLanguages = new Set(["text", "txt", "plain", "plaintext"]);
const languageAliases: Record<string, string> = {
  gitignore: "ini",
  env: "dotenv",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  cjs: "javascript",
  mjs: "javascript",
  tsx: "tsx",
  jsx: "jsx",
};
const MAX_HIGHLIGHT_CACHE_ENTRIES = 100;
const highlightedHtmlCache = new Map<string, string>();

function setCachedHighlightedHtml(cacheKey: string, html: string) {
  highlightedHtmlCache.set(cacheKey, html);
  if (highlightedHtmlCache.size > MAX_HIGHLIGHT_CACHE_ENTRIES) {
    const oldestKey = highlightedHtmlCache.keys().next().value;
    if (oldestKey) highlightedHtmlCache.delete(oldestKey);
  }
}

interface CodeBlockProps {
  language?: string;
  title?: string;
  meta?: string;
  className?: string;
  children?: React.ReactNode;
  /** raw text content for clipboard — extracted from the markdown AST by the renderer */
  rawContent?: string;
}

function normalizeLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return "text";
  return languageAliases[normalized] ?? normalized;
}

function languageLabel(language?: string) {
  if (!language) return "plain text";
  return language.trim();
}

function cacheHash(input: string) {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function fallbackText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(fallbackText).join("");
  return "";
}

export default function CodeBlock({
  language,
  title,
  meta,
  className,
  children,
  rawContent,
}: CodeBlockProps) {
  const { t = (key: string) => key } = useI18n();
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const code = rawContent ?? fallbackText(children);
  const shikiLanguage = normalizeLanguage(language);
  const label = languageLabel(language);
  const cacheKey = useMemo(
    () => `${SHIKI_THEME}:${shikiLanguage}:${cacheHash(code)}`,
    [code, shikiLanguage],
  );

  useEffect(() => {
    let cancelled = false;

    if (!code) {
      setHighlightedHtml(null);
      return;
    }

    const cached = highlightedHtmlCache.get(cacheKey);
    if (cached) {
      setHighlightedHtml(cached);
      return;
    }

    setHighlightedHtml(null);

    async function highlight() {
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const html = await codeToHtml(code, {
          lang: plaintextLanguages.has(shikiLanguage) ? "text" : shikiLanguage,
          theme: SHIKI_THEME,
        });
        setCachedHighlightedHtml(cacheKey, html);
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        if (plaintextLanguages.has(shikiLanguage)) return;
        try {
          const { codeToHtml } = await import("shiki/bundle/web");
          const html = await codeToHtml(code, { lang: "text", theme: SHIKI_THEME });
          setCachedHighlightedHtml(cacheKey, html);
          if (!cancelled) setHighlightedHtml(html);
        } catch {
          if (!cancelled) setHighlightedHtml(null);
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, code, shikiLanguage]);

  const handleCopy = async () => {
    if (!code || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const preClassName = [
    "m-0 overflow-x-auto p-4 text-sm leading-relaxed",
    wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // future: if (language === "mermaid") return <MermaidBlock>{children}</MermaidBlock>;
  // use dynamic(() => import("./mermaid-block"), { ssr: false }) to keep Mermaid's ~2MB out of the bundle

  return (
    <div className="group my-4 overflow-hidden rounded-lg border border-border-subtle bg-[#0d1117] text-sm shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-text-secondary">
            {title ?? label}
          </div>
          {title && (
            <div className="truncate text-[10px] uppercase tracking-wider text-text-tertiary">
              {label}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setWrap((current) => !current)}
            className="rounded px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
            aria-pressed={wrap}
            aria-label={wrap ? t("Disable code wrapping") : t("Enable code wrapping")}
            title={wrap ? t("Disable wrap") : t("Wrap code")}
          >
            {wrap ? t("Unwrap") : t("Wrap")}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
            aria-label={t("Copy code")}
            title={copied ? t("Copied") : t("Copy")}
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {highlightedHtml ? (
        <div
          className={[
            "oghma-shiki-code [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed [&_pre]:outline-none [&_code]:font-mono",
            wrap
              ? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"
              : "[&_pre]:overflow-x-auto [&_pre]:whitespace-pre",
          ].join(" ")}
          // Shiki escapes source code before tokenizing. Raw markdown HTML is handled by each
          // renderer's ReactMarkdown/rehype policy before this component sees fenced code text.
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className={preClassName}>
          <code>{code}</code>
        </pre>
      )}
      {meta && !title && (
        <div className="border-t border-border-subtle bg-surface px-3 py-1.5 text-[10px] text-text-tertiary">
          {meta}
        </div>
      )}
    </div>
  );
}
