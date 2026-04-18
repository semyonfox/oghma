"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  // pre extracts language and delegates to CodeBlock;
  // code passes through hljs classes so rehype-highlight tokens survive
  pre: ({ children }: any) => {
    const codeEl = (children as any)?.props;
    const cls: string = codeEl?.className ?? "";
    const lang = /language-([a-z0-9_-]+)/i.exec(cls)?.[1];
    const rawContent =
      typeof codeEl?.children === "string" ? codeEl.children : undefined;
    return (
      <CodeBlock language={lang} rawContent={rawContent}>
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
        remarkPlugins={[remarkGfm, ...(remarkPlugins ?? [])]}
        rehypePlugins={rehypePlugins ?? []}
        components={merged}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
