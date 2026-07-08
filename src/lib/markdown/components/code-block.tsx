"use client";

import { useMemo, useState } from "react";
import {
  ArrowPathRoundedSquareIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

export interface CodeBlockProps {
  language?: string;
  title?: string;
  className?: string;
  children?: React.ReactNode;
  /** raw text content for clipboard — extracted from the markdown AST by the renderer */
  rawContent?: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  kotlin: "Kotlin",
  markdown: "Markdown",
  php: "PHP",
  plaintext: "Plain text",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  text: "Plain text",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  cplusplus: "cpp",
  cs: "csharp",
  htm: "html",
  js: "javascript",
  jsonc: "json",
  md: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  shellsession: "shell",
  text: "plaintext",
  ts: "typescript",
  yml: "yaml",
};

export function normalizeLanguage(language?: string): {
  normalized?: string;
  label: string;
  known: boolean;
} {
  const cleaned = language?.trim().toLowerCase().replace(/^language-/, "");
  if (!cleaned) {
    return { label: "CODE", known: false };
  }

  const normalized = LANGUAGE_ALIASES[cleaned] ?? cleaned;
  const label = LANGUAGE_LABELS[normalized];

  return {
    normalized,
    label: label ?? "CODE",
    known: Boolean(label),
  };
}

export default function CodeBlock({
  language,
  title,
  className,
  children,
  rawContent,
}: CodeBlockProps) {
  const { t = (key: string) => key } = useI18n();
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const languageInfo = useMemo(() => normalizeLanguage(language), [language]);

  const handleCopy = async () => {
    const text = rawContent ?? (typeof children === "string" ? children : "");
    if (!text || !navigator.clipboard?.writeText) return;

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  // future: if (language === "mermaid") return <MermaidBlock>{children}</MermaidBlock>;
  // use dynamic(() => import("./mermaid-block"), { ssr: false }) to keep Mermaid's ~2MB out of the bundle

  return (
    <figure
      className="oghma-codeblock group my-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.95)] ring-1 ring-white/[0.03]"
      data-code-language={languageInfo.normalized ?? "code"}
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.08] bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-slate-950/95 px-4 py-2.5">
        <figcaption className="min-w-0">
          {title ? (
            <div className="truncate text-[0.82rem] font-medium text-slate-100">
              {title}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400/80 shadow-[0_0_12px_rgba(129,140,248,0.75)]" />
            <span className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
              {languageInfo.label}
            </span>
          </div>
        </figcaption>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWrapped((value) => !value)}
            className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-slate-400 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            aria-pressed={wrapped}
            aria-label={wrapped ? t("Disable line wrap") : t("Enable line wrap")}
            title={wrapped ? t("Disable line wrap") : t("Enable line wrap")}
          >
            <ArrowPathRoundedSquareIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            aria-label={t("Copy code")}
            title={copied ? t("Copied") : t("Copy")}
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-emerald-300" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4" />
            )}
            <span>{copied ? t("Copied") : t("Copy")}</span>
          </button>
        </div>
      </div>

      <pre
        className={`m-0 overflow-x-auto bg-[var(--md-code-bg)] text-[0.86rem] leading-6 text-[var(--md-syntax-base)] [tab-size:2] ${
          wrapped ? "whitespace-pre-wrap break-words" : ""
        } ${className ?? ""}`}
      >
        {children}
      </pre>
    </figure>
  );
}
