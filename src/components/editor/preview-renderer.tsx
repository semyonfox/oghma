'use client';

import { useEffect, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { codeToHtml } from 'shiki';

// shiki-powered code block — uses the same oneDark palette as the CodeMirror editor
const ShikiCode = memo(function ShikiCode({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, { lang, theme: 'one-dark-pro' })
      .then((result) => { if (!cancelled) setHtml(result); })
      .catch(() => {}); // unsupported language — stays in fallback
    return () => { cancelled = true; };
  }, [code, lang]);

  if (!html) {
    // fallback while shiki loads — matches one-dark-pro background
    return (
      <pre className="rounded-lg bg-[#282c34] p-4 overflow-x-auto">
        <code className="text-sm font-mono text-[#abb2bf]">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="[&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_code]:text-sm [&_code]:font-mono"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface PreviewRendererProps {
  content: string;
}

export default function PreviewRenderer({ content }: PreviewRendererProps) {
  return (
    <div className="w-full prose prose-lg prose-invert max-w-none bg-background" dir="ltr">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline"
            />
          ),
          // replace pre with a plain wrapper — ShikiCode renders its own <pre>
          pre: ({ children }: any) => (
            <div className="my-4">{children}</div>
          ),
          code: ({ node, className, children, ...props }: any) => {
            const lang = /language-(\w+)/.exec(className || '')?.[1];
            const codeString = String(children).replace(/\n$/, '');

            // fenced code block with language — shiki highlighting
            if (lang) {
              return <ShikiCode code={codeString} lang={lang} />;
            }

            // unlanguaged block code (multiline)
            if (codeString.includes('\n')) {
              return (
                <pre className="rounded-lg bg-[#282c34] p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-[#abb2bf]">{codeString}</code>
                </pre>
              );
            }

            // inline code
            return (
              <code
                className="rounded bg-surface text-sm px-1.5 py-0.5 font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1: ({ node, children, ...props }) => (
            <h1 className="text-4xl font-bold mt-8 mb-4" {...props}>
              {children}
            </h1>
          ),
          h2: ({ node, children, ...props }) => (
            <h2 className="text-3xl font-bold mt-6 mb-3" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node, children, ...props}) => (
            <h3 className="text-2xl font-bold mt-4 mb-2" {...props}>
              {children}
            </h3>
          ),
          blockquote: ({ node, children, ...props }) => (
            <blockquote
              className="border-l-4 border-primary-500 pl-4 italic my-4 text-text-secondary"
              {...props}
            >
              {children}
            </blockquote>
          ),
          table: ({ node, children, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table
                className="min-w-full border border-border"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ node, children, ...props }) => (
            <th
              className="border border-border px-4 py-2 bg-surface font-semibold text-left"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ node, children, ...props }) => (
            <td
              className="border border-border px-4 py-2"
              {...props}
            >
              {children}
            </td>
          ),
          ul: ({ node, children, ...props }) => (
            <ul className="list-disc list-outside pl-6 my-3 space-y-1 text-text" {...props}>
              {children}
            </ul>
          ),
          ol: ({ node, children, ...props }) => (
            <ol className="list-decimal list-outside pl-6 my-3 space-y-1 text-text" {...props}>
              {children}
            </ol>
          ),
          li: ({ node, children, ...props }) => (
            <li className="ml-1 leading-relaxed" {...props}>
              {children}
            </li>
          ),
        }}
      >
        {content || '*No content*'}
      </ReactMarkdown>
    </div>
  );
}
