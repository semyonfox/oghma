"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import type { PluggableList } from "unified";
import CodeBlock from "./components/code-block";

export interface MarkdownRendererProps {
  children: string;
  className?: string;
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
  /** merged with (and overrides) base components */
  components?: Partial<Components>;
}

type MarkdownAstNode = {
  type?: string;
  meta?: unknown;
  data?: {
    hProperties?: Record<string, unknown>;
  };
  children?: MarkdownAstNode[];
};

function extractFenceTitle(meta?: string) {
  const titleMatch = meta?.match(
    /(?:^|\s)(?:title|filename)=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i,
  );
  return titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3];
}

function remarkPreserveCodeMeta() {
  return (tree: MarkdownAstNode) => {
    const visit = (node: MarkdownAstNode) => {
      if (node.type === "code" && typeof node.meta === "string" && node.meta.trim()) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            dataCodeMeta: node.meta.trim(),
          },
        };
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}

const baseComponents: Partial<Components> = {
  a: ({ href, children, ...props }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-400 underline underline-offset-2 hover:text-primary-300 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  // pre extracts fence metadata and delegates block rendering/highlighting to CodeBlock.
  pre: ({ children }: any) => {
    const codeEl = (children as any)?.props;
    const cls: string = codeEl?.className ?? "";
    const lang = /language-([a-z0-9_-]+)/i.exec(cls)?.[1];
    const rawContent =
      typeof codeEl?.children === "string" ? codeEl.children : undefined;
    const meta =
      typeof codeEl?.dataCodeMeta === "string"
        ? codeEl.dataCodeMeta
        : typeof codeEl?.node?.properties?.dataCodeMeta === "string"
          ? codeEl.node.properties.dataCodeMeta
          : typeof codeEl?.node?.data?.meta === "string"
            ? codeEl.node.data.meta
            : typeof codeEl?.meta === "string"
              ? codeEl.meta
              : undefined;
    const title = extractFenceTitle(meta);
    return (
      <CodeBlock language={lang} title={title} meta={meta} rawContent={rawContent}>
        {children}
      </CodeBlock>
    );
  },
  code: ({ children, className, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-subtle px-1.5 py-0.5 rounded text-xs font-mono"
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

export default function MarkdownRenderer({
  children,
  className,
  remarkPlugins,
  rehypePlugins,
  components,
}: MarkdownRendererProps) {
  const merged = { ...baseComponents, ...components };
  const wrapperClass = ["md-rendered", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkPreserveCodeMeta, ...(remarkPlugins ?? [])]}
        rehypePlugins={[...(rehypePlugins ?? []), rehypeKatex]}
        components={merged}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
