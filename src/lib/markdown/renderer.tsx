"use client";

import { isValidElement, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Components, ExtraProps } from "react-markdown";
import type { Pluggable, PluggableList } from "unified";
import CodeBlock from "./components/code-block";
import { markdownSanitizeSchema } from "./sanitize-schema";
import { parseInternalNoteHref } from "@/lib/notes/internal-links";

export type MarkdownRendererVariant = "note" | "chat" | "quiz";

interface MarkdownVariantConfig {
  /** Enables hard line breaks in markdown. */
  breaks: boolean;
  /** Parses raw HTML into the markdown tree before sanitization. */
  allowRawHtml: boolean;
  /** Runs rehype-sanitize with the shared markdown schema. */
  sanitize: boolean;
}

export const markdownRendererVariants: Record<
  MarkdownRendererVariant,
  MarkdownVariantConfig
> = {
  note: {
    breaks: true,
    allowRawHtml: true,
    sanitize: true,
  },
  chat: {
    breaks: true,
    allowRawHtml: false,
    sanitize: true,
  },
  quiz: {
    breaks: false,
    allowRawHtml: false,
    sanitize: true,
  },
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
  properties?: Record<string, unknown>;
  data?: { meta?: string };
};

function textFromHast(node: HastNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  return node.children?.map(textFromHast).join("") ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringProperty(
  value: Record<string, unknown>,
  property: string,
): string | undefined {
  const candidate = value[property];
  return typeof candidate === "string" ? candidate : undefined;
}

function hastNodeFrom(value: unknown): HastNode | undefined {
  if (!isRecord(value)) return undefined;
  const children = Array.isArray(value.children)
    ? value.children.map(hastNodeFrom).filter((child) => child !== undefined)
    : undefined;
  const properties = isRecord(value.properties) ? value.properties : undefined;
  const data = isRecord(value.data)
    ? { meta: stringProperty(value.data, "meta") }
    : undefined;

  return {
    type: stringProperty(value, "type"),
    tagName: stringProperty(value, "tagName"),
    value: stringProperty(value, "value"),
    children,
    properties,
    data,
  };
}

export function parseCodeFenceTitle(meta?: string): string | undefined {
  if (!meta) return undefined;

  const quoted = /(?:title|filename|file)=(['"])(.*?)\1/i.exec(meta);
  if (quoted?.[2]) return quoted[2].trim() || undefined;

  const bare = /(?:title|filename|file)=([^\s{}]+)/i.exec(meta);
  if (bare?.[1]) return bare[1].trim() || undefined;

  const firstQuoted = /(['"])(.*?)\1/.exec(meta);
  if (firstQuoted?.[2]) return firstQuoted[2].trim() || undefined;

  return undefined;
}

function remarkCodeFenceMeta() {
  return (tree: unknown) => {
    const visit = (node: unknown) => {
      if (!isRecord(node)) return;
      if (node.type === "code" && typeof node.meta === "string") {
        const data = isRecord(node.data) ? node.data : {};
        const hProperties = isRecord(data.hProperties) ? data.hProperties : {};
        node.data = {
          ...data,
          hProperties: {
            ...hProperties,
            dataMeta: node.meta,
          },
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

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> &
  ExtraProps & {
    dataMeta?: string;
  };

function MarkdownCode({
  children,
  className,
  node: _node,
  dataMeta: _dataMeta,
  ...props
}: MarkdownCodeProps) {
  const isInline = !className;
  if (isInline) {
    return <code {...props}>{children}</code>;
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

const baseComponents: Partial<Components> = {
  a: ({ href, children, ...props }) => {
    const isInternalNote = Boolean(parseInternalNoteHref(href));
    return (
      <a
        href={href}
        target={isInternalNote ? undefined : "_blank"}
        rel={isInternalNote ? undefined : "noopener noreferrer"}
        className="text-[var(--md-link)] underline underline-offset-2 hover:text-[var(--md-link-hover)] transition-colors"
        {...props}
      >
        {children}
      </a>
    );
  },
  // pre extracts language and delegates to CodeBlock; CodeBlock owns async Shiki highlighting.
  pre: ({ children }) => {
    const codeProps =
      isValidElement(children) && isRecord(children.props)
        ? children.props
        : undefined;
    const cls = codeProps ? stringProperty(codeProps, "className") ?? "" : "";
    const lang = /language-([a-z0-9_-]+)/i.exec(cls)?.[1];
    const codeNode = hastNodeFrom(codeProps?.node);
    const rawContent = textFromHast(codeNode) || undefined;
    const meta =
      (codeProps ? stringProperty(codeProps, "dataMeta") : undefined) ??
      (codeProps ? stringProperty(codeProps, "data-meta") : undefined) ??
      (codeProps ? stringProperty(codeProps, "meta") : undefined) ??
      codeNode?.data?.meta ??
      (typeof codeNode?.properties?.dataMeta === "string"
        ? codeNode.properties.dataMeta
        : undefined);
    const title = parseCodeFenceTitle(meta);

    return (
      <CodeBlock language={lang} rawContent={rawContent} title={title}>
        {children}
      </CodeBlock>
    );
  },
  code: MarkdownCode,
  strong: ({ children }) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  input: ({ type, node: _node, ...props }) => (
    <input type={type} {...props} tabIndex={type === "checkbox" ? -1 : undefined} />
  ),
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
  const sanitizePlugin: Pluggable = [rehypeSanitize, markdownSanitizeSchema];

  if (config.allowRawHtml) {
    plugins.push(rehypeRaw);
  }
  if (config.sanitize) {
    plugins.push(sanitizePlugin);
  }

  plugins.push(...extraPlugins, rehypeKatex);
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
