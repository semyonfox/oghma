'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';

interface PreviewRendererProps {
  content: string;
}

export default function PreviewRenderer({ content }: PreviewRendererProps) {
  return (
    <div className="w-full h-full overflow-auto p-6 bg-surface dark:bg-neutral-900" dir="ltr">
      <div className="prose prose-lg dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight, rehypeRaw]}
          components={{
            // Links rendered to open in new tabs for safety, styled with hover effects
            a: ({ node, ...props }) => (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              />
            ),
            // custom code block styling
            code: ({ node, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match;
              
              if (isInline) {
                return (
<code
  className="rounded bg-gray-100 dark:bg-gray-800 text-sm px-1.5 py-0.5 font-mono"
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
            // custom heading anchors
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
            // custom blockquote styling: consistent margins and dark mode support
            blockquote: ({ node, children, ...props }) => (
              <blockquote
                className="border-l-4 border-primary-500 pl-4 italic my-4 text-neutral-700 dark:text-neutral-300"
                {...props}
              >
                {children}
              </blockquote>
            ),
            // custom table styling
            table: ({ node, children, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table
                  className="min-w-full border border-neutral-300 dark:border-neutral-700"
                  {...props}
                >
                  {children}
                </table>
              </div>
            ),
            th: ({ node, children, ...props }) => (
              <th
                className="border border-neutral-300 dark:border-neutral-700 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 font-semibold text-left"
                {...props}
              >
                {children}
              </th>
            ),
            td: ({ node, children, ...props }) => (
              <td
                className="border border-neutral-300 dark:border-neutral-700 px-4 py-2"
                {...props}
              >
                {children}
              </td>
            ),
          }}
        >
          {content || '*No content*'}
        </ReactMarkdown>
      </div>
    </div>
  );
}
