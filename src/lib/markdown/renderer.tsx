"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import type { PluggableList } from "unified";
import CodeBlock from "./components/code-block";

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
  remarkPlugins?: PluggableList;
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
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkCodeFenceMeta,
          ...(remarkPlugins ?? []),
        ]}
        rehypePlugins={[...(rehypePlugins ?? []), rehypeKatex]}
        components={merged}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
