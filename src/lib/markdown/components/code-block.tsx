"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ThemedToken } from "shiki/core";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { highlightCode, type HighlightedCode } from "../shiki-highlighter";

const MermaidBlock = dynamic(() => import("./mermaid-block"), { ssr: false });

export interface CodeBlockProps {
  language?: string;
  title?: string;
  className?: string;
  children?: React.ReactNode;
  /** raw text content for clipboard/highlighting — extracted from the markdown AST by the renderer */
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
  mermaid: "Mermaid",
  php: "PHP",
  plaintext: "Plain text",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  shell: "Shell",
  shellscript: "Shell",
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

function tokenStyle(token: ThemedToken): CSSProperties | undefined {
  if (token.htmlStyle) return token.htmlStyle as CSSProperties;

  const style: CSSProperties = {};
  if (token.color) style.color = token.color;
  if (token.bgColor) style.backgroundColor = token.bgColor;

  if (token.fontStyle) {
    // Shiki's FontStyle enum is bitwise: 1 italic, 2 bold, 4 underline.
    if (token.fontStyle & 1) style.fontStyle = "italic";
    if (token.fontStyle & 2) style.fontWeight = 700;
    if (token.fontStyle & 4) style.textDecoration = "underline";
  }

  return Object.keys(style).length ? style : undefined;
}

function renderHighlightedLines(tokens: ThemedToken[][]): ReactNode[] {
  return tokens.flatMap((line, lineIndex) => [
    <span className="line" key={`line-${lineIndex}`}>
      {line.length
        ? line.map((token, tokenIndex) => (
            <span key={tokenIndex} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))
        : ""}
    </span>,
    lineIndex < tokens.length - 1 ? "\n" : null,
  ]);
}

function extractPlainText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((child) => extractPlainText(child)).join("");
  }
  if (
    children &&
    typeof children === "object" &&
    "props" in children &&
    (children as { props?: { children?: React.ReactNode } }).props
  ) {
    return extractPlainText(
      (children as { props: { children?: React.ReactNode } }).props.children,
    );
  }
  return "";
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
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null);
  const [highlightError, setHighlightError] = useState(false);
  const requestId = useRef(0);
  const languageInfo = useMemo(() => normalizeLanguage(language), [language]);
  const code = useMemo(
    () => rawContent ?? extractPlainText(children),
    [children, rawContent],
  );

  useEffect(() => {
    if (!code) {
      setHighlighted(null);
      setHighlightError(false);
      return;
    }

    let active = true;
    const currentRequest = ++requestId.current;
    setHighlightError(false);
    setHighlighted(null);

    highlightCode(code, languageInfo.normalized)
      .then((result) => {
        if (active && requestId.current === currentRequest) setHighlighted(result);
      })
      .catch(() => {
        if (active && requestId.current === currentRequest) setHighlightError(true);
      });

    return () => {
      active = false;
    };
  }, [code, languageInfo.normalized]);

  const handleCopy = async () => {
    if (!code || !navigator.clipboard?.writeText) return;

    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (languageInfo.normalized === "mermaid") {
    return <MermaidBlock code={code} title={title} />;
  }

  return (
    <figure
      className="oghma-codeblock group"
      data-code-language={languageInfo.normalized ?? "code"}
    >
      <div className="oghma-codeblock-header">
        <figcaption className="min-w-0">
          {title ? (
            <div className="oghma-codeblock-title">
              {title}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="oghma-codeblock-dot" />
            <span className="oghma-codeblock-language">
              {languageInfo.label}
            </span>
          </div>
        </figcaption>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="oghma-codeblock-copy"
            aria-label={t("Copy code")}
            title={copied ? t("Copied") : t("Copy")}
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-success-400" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4" />
            )}
            <span>{copied ? t("Copied") : t("Copy")}</span>
          </button>
        </div>
      </div>

      <pre
        className={className}
        data-shiki-state={
          highlighted ? "highlighted" : highlightError ? "fallback" : "loading"
        }
      >
        <code className={language ? `language-${language}` : undefined}>
          {highlighted ? renderHighlightedLines(highlighted.tokens) : code}
        </code>
      </pre>
    </figure>
  );
}
