"use client";

import { FC, useState } from "react";
import {
  SparklesIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { Message, SearchContextData } from "./chat-interface";

// relevance level from cosine distance
// lower distance = higher relevance
function relevanceLabel(distance: number): {
  label: string;
  color: string;
} {
  if (distance < 0.3) return { label: "high", color: "text-green-400" };
  if (distance < 0.5) return { label: "medium", color: "text-yellow-400" };
  return { label: "low", color: "text-text-tertiary" };
}

// deduplicate search results by noteId, keeping the best (lowest) distance
function dedupeResults(
  results: SearchContextData["results"],
): SearchContextData["results"] {
  const best = new Map<
    string,
    SearchContextData["results"][number]
  >();
  for (const r of results) {
    const existing = best.get(r.noteId);
    if (!existing || r.distance < existing.distance) {
      best.set(r.noteId, r);
    }
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}

// search context bubble — shows what files were searched and what was found
const SearchContextBubble: FC<{ context: SearchContextData }> = ({
  context,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const uniqueResults = dedupeResults(context.results);
  const hasResults = uniqueResults.length > 0;

  return (
    <div className="glass-card rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
      {/* header row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left group"
      >
        <MagnifyingGlassIcon className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
        <span className="text-text-secondary text-xs">
          {hasResults
            ? t("chat.search_found", {
                count: String(uniqueResults.length),
                scope: context.scopeSize
                  ? t("chat.search_scope_n", {
                      n: String(context.scopeSize),
                    })
                  : t("chat.search_scope_all"),
              })
            : t("chat.search_no_results")}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-text-tertiary ml-auto transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* expanded: show each result as a file row */}
      {expanded && hasResults && (
        <div className="mt-2.5 space-y-1.5">
          {uniqueResults.map((r) => {
            const rel = relevanceLabel(r.distance);
            return (
              <a
                key={r.noteId}
                href={`/notes/${r.noteId}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-subtle/50 border border-border-subtle hover:border-primary-500/30 hover:bg-subtle transition-colors group"
              >
                <DocumentTextIcon className="w-3.5 h-3.5 text-text-tertiary group-hover:text-primary-400 flex-shrink-0 transition-colors" />
                <span className="flex-1 text-xs text-text-secondary truncate">
                  {r.title}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide ${rel.color} flex-shrink-0`}
                >
                  {rel.label}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {/* expanded but no results */}
      {expanded && !hasResults && (
        <p className="mt-2 text-xs text-text-tertiary">
          {t("chat.search_no_matches_detail")}
        </p>
      )}
    </div>
  );
};

// file box cards for sources used in the answer
const SourceFileBoxes: FC<{
  sources: { id: string; title: string }[];
}> = ({ sources }) => {
  const { t } = useI18n();
  if (!Array.isArray(sources) || !sources.length) return null;

  return (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5 ml-0.5">
        {t("chat.used_in_answer")}
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <a
            key={s.id}
            href={`/notes/${s.id}`}
            className="group flex items-start gap-2 px-3 py-2 rounded-xl bg-subtle/60 border border-border-subtle hover:border-primary-500/30 hover:bg-primary-500/5 transition-colors min-w-[120px] max-w-[200px]"
          >
            <DocumentTextIcon className="w-4 h-4 text-text-tertiary group-hover:text-primary-400 flex-shrink-0 mt-0.5 transition-colors" />
            <span className="text-xs text-text-secondary group-hover:text-text leading-snug line-clamp-2 transition-colors">
              {s.title || t("Untitled")}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};

// compact source chips (used in sidebar variant, kept minimal)
export const SourceChips: FC<{
  sources: { id: string; title: string }[];
}> = ({ sources }) => {
  const { t } = useI18n();
  if (!Array.isArray(sources) || !sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {sources.map((s) => (
        <a
          key={s.id}
          href={`/notes/${s.id}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-subtle border border-border-subtle text-xs text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <DocumentTextIcon className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="max-w-[120px] truncate">
            {s.title || t("Untitled")}
          </span>
        </a>
      ))}
    </div>
  );
};

const RetrievalSection: FC<{
  label: string;
  sources: { id: string; title: string }[];
  helper?: string;
}> = ({ label, sources, helper }) => (
  <div className="mt-2">
    <p className="text-[11px] text-text-tertiary mb-1">{label}</p>
    {sources.length > 0 ? (
      <SourceChips sources={sources} />
    ) : helper ? (
      <p className="text-[11px] text-text-tertiary/80">{helper}</p>
    ) : null}
  </div>
);

// typing animation dots
export const TypingDots: FC = () => (
  <div className="flex items-center gap-1 px-1 py-0.5">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </div>
);

// compact message bubble (sidebar variant)
export const CompactMessageBubble: FC<{ message: Message }> = ({
  message: m,
}) => (
  <div
    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
  >
    <div
      className={`max-w-[85%] px-2.5 py-1.5 rounded-md text-xs leading-relaxed ${
        m.role === "user"
          ? "bg-primary-500/70 text-text-on-primary rounded-br-sm"
          : "bg-surface border border-border-subtle text-text-secondary rounded-bl-sm"
      }`}
    >
      {m.role === "assistant" ? (
        m.content.trim() ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              code: ({ children }) => (
                <code className="bg-subtle px-1 rounded text-xs">
                  {children}
                </code>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>
        ) : (
          <TypingDots />
        )
      ) : (
        m.content
      )}
      {m.sources && m.sources.length > 0 && <SourceChips sources={m.sources} />}
    </div>
  </div>
);

// full-page message bubble with double-bubble layout for assistant
export const FullMessageBubble: FC<{ message: Message }> = ({
  message: m,
}) => {
  // user messages stay as a single right-aligned bubble
  if (m.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-lg">
          <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-primary-500/85 text-text-on-primary text-sm leading-relaxed">
            <p>{m.content}</p>
          </div>
          <p className="text-xs text-text-tertiary opacity-60 mt-1 mr-1 text-right">
            {new Date(m.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );
  }

  // assistant: double-bubble layout
  // bubble 1: search context (what was searched, what was found)
  // bubble 2: answer content + source file boxes
  const hasSearchContext =
    m.searchContext && m.searchContext.results.length > 0;
  const hasSources = m.sources && m.sources.length > 0;

  return (
    <div className="flex gap-3 justify-start">
      {/* avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/15 border border-primary-500/25 flex items-center justify-center mt-0.5">
        <SparklesIcon className="w-3.5 h-3.5 text-primary-400" />
      </div>

      <div className="max-w-2xl space-y-2">
        {/* bubble 1: search context */}
        {hasSearchContext && (
          <SearchContextBubble context={m.searchContext!} />
        )}

        {/* retrieval sections */}
        {m.retrieval && (
          <div className="mt-2 ml-1">
            <RetrievalSection
              label={`${t("chat.retrieval.available_to_search")} (${m.retrieval.availableCount})`}
              sources={m.retrieval.availableFiles}
              helper={
                m.retrieval.scopeMode === "global"
                  ? t("chat.retrieval.available_global_helper")
                  : undefined
              }
            />
            <RetrievalSection
              label={`${t("chat.retrieval.semantic_found")} (${m.retrieval.semanticHits.length})`}
              sources={m.retrieval.semanticHits}
              helper={t("chat.retrieval.semantic_empty")}
            />
            <RetrievalSection
              label={`${t("chat.retrieval.used_in_answer")} (${m.retrieval.usedFiles.length})`}
              sources={m.retrieval.usedFiles}
              helper={t("chat.retrieval.used_empty")}
            />
          </div>
        )}

        {/* bubble 2: answer + source file boxes */}
        <div className="glass-card rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-text">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 space-y-0.5">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-2 space-y-0.5">
                  {children}
                </ol>
              ),
              code: ({ children, className: cls }) => {
                const isBlock = cls?.includes("language-");
                return isBlock ? (
                  <code className="block bg-black/30 rounded-lg p-3 text-xs font-mono my-2 overflow-x-auto whitespace-pre">
                    {children}
                  </code>
                ) : (
                  <code className="bg-subtle px-1.5 py-0.5 rounded text-xs font-mono">
                    {children}
                  </code>
                );
              },
              strong: ({ children }) => (
                <strong className="font-semibold text-text">
                  {children}
                </strong>
              ),
              h3: ({ children }) => (
                <h3 className="font-semibold text-text mt-3 mb-1">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="font-medium text-text mt-2 mb-1">
                  {children}
                </h4>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>

          {/* source file boxes inside the answer bubble */}
          {hasSources && <SourceFileBoxes sources={m.sources!} />}
        </div>

        {/* timestamp */}
        <p className="text-xs text-text-tertiary opacity-60 ml-1">
          {new Date(m.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
};
