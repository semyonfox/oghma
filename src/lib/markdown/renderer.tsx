"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import type { Pluggable, PluggableList } from "unified";
import CodeBlock from "./components/code-block";
import { markdownSanitizeSchema } from "./sanitize-schema";

export type MarkdownRendererVariant = "note" | "chat" | "quiz";

interface MarkdownVariantConfig {
  /** Enables hard line breaks in markdown. */
  breaks: boolean;
  /** Parses raw HTML into the markdown tree before sanitization. */
  allowRawHtml: boolean;
  /** Runs rehype-sanitize with the shared markdown schema. */
  sanitize: boolean;
  /** Runs the current Highlight.js-backed code highlighter. */
  highlight: boolean;
}

export const markdownRendererVariants: Record<
  MarkdownRendererVariant,
  MarkdownVariantConfig
> = {
  note: {
    breaks: true,
    allowRawHtml: true,
    sanitize: true,
    highlight: true,
  },
  chat: {
    breaks: true,
    allowRawHtml: false,
    sanitize: true,
    highlight: true,
  },
  quiz: {
    breaks: false,
    allowRawHtml: false,
    sanitize: true,
    highlight: true,
  },
};

function parseCodeFenceTitle(meta: unknown): string | undefined {
  if (typeof meta !== "string") return undefined;
  const match = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/.exec(meta);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function remarkCodeFenceMeta() {
  return (tree: any) => {
    const visit = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "code" && typeof node.meta === "string") {
        node.data = node.data ?? {};
        node.data.hProperties = {
          ...(node.data.hProperties ?? {}),
          dataMeta: node.meta,
        };
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };

    visit(tree);
  };
}

export interface MarkdownRendererProps {
  children: string;
  className?: string;
  variant?: MarkdownRendererVariant;
  /** Additional remark plugins appended after the variant defaults. */
  remarkPlugins?: PluggableList;
  /** Additional rehype plugins appended after the variant defaults, before KaTeX. */
  rehypePlugins?: PluggableList;
  /** merged with (and overrides) base components */
  components?: Partial<Components>;
}

const baseComponents: Partial<Components> = {
  a: ({ href, children, ...props }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--md-link)] underline underline-offset-2 hover:text-[var(--md-link-hover)] transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  // pre extracts language and delegates to CodeBlock;
  // code passes through hljs classes so rehype-highlight tokens survive
  pre: ({ children }: any) => {
    const codeEl = (children as any)?.props;
    const cls: string = codeEl?.className ?? "";
    const lang = /language-([a-z0-9_-]+)/i.exec(cls)?.[1];
    const title = parseCodeFenceTitle(
      codeEl?.dataMeta ??
        codeEl?.["data-meta"] ??
        codeEl?.node?.meta ??
        codeEl?.node?.data?.meta ??
        codeEl?.meta,
    );
    const rawContent =
      typeof codeEl?.children === "string" ? codeEl.children : undefined;
    return (
      <CodeBlock language={lang} title={title} rawContent={rawContent}>
        {children}
      </CodeBlock>
    );
  },
  code: ({
    children,
    className,
    node: _node,
    dataMeta: _dataMeta,
    ...props
  }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-[var(--md-surface-subtle)] px-1.5 py-0.5 rounded text-xs font-mono text-[var(--md-text)]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  strong: ({ children }: any) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  em: ({ children }: any) => <em className="italic">{children}</em>,
};

function buildRemarkPlugins(
  variant: MarkdownRendererVariant,
  extraPlugins: PluggableList = [],
): PluggableList {
  const config = markdownRendererVariants[variant];
  const plugins: PluggableList = [remarkGfm, remarkMath, remarkCodeFenceMeta];

  if (config.breaks) {
    plugins.push(remarkBreaks);
  }

  plugins.push(...extraPlugins);
  return plugins;
}

function buildRehypePlugins(
  variant: MarkdownRendererVariant,
  extraPlugins: PluggableList = [],
): PluggableList {
  const config = markdownRendererVariants[variant];
  const plugins: PluggableList = [];
  const sanitizePlugin = [
    rehypeSanitize,
    markdownSanitizeSchema,
  ] as unknown as Pluggable;

  if (config.allowRawHtml) {
    plugins.push(rehypeRaw as Pluggable);
  }
  if (config.highlight) {
    plugins.push([rehypeHighlight, { ignoreMissing: true }] as unknown as Pluggable);
  }
  if (config.sanitize) {
    plugins.push(sanitizePlugin);
  }

  plugins.push(...extraPlugins, rehypeKatex as Pluggable);
  return plugins;
}

export default function MarkdownRenderer({
  children,
  className,
  variant = "note",
  remarkPlugins,
  rehypePlugins,
  components,
}: MarkdownRendererProps) {
  const merged = { ...baseComponents, ...components };
  const wrapperClass = ["md-rendered", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass} data-markdown-variant={variant}>
      <ReactMarkdown
        remarkPlugins={buildRemarkPlugins(variant, remarkPlugins)}
        rehypePlugins={buildRehypePlugins(variant, rehypePlugins)}
        components={merged}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
