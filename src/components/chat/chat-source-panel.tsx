"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import useI18n from "@/lib/notes/hooks/use-i18n";
import MarkdownRenderer from "@/lib/markdown/renderer";

interface Source {
  id: string;
  title: string;
}

const noteSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
});

type Loaded =
  | { id: string; state: "ready"; content: string; isPdf: boolean }
  | { id: string; state: "error" };

// the right-hand panel from the Atlas chat mockup: the latest answer's sources,
// numbered like its citations, with the selected one readable beside the chat
export default function ChatSourcePanel({ sources }: { sources: Source[] }) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(sources[0]?.id);
  const [loaded, setLoaded] = useState<Loaded>();
  const activeId = sources.some((source) => source.id === selectedId)
    ? selectedId
    : sources[0]?.id;

  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    void fetch(`/api/notes/${encodeURIComponent(activeId)}`, { signal: controller.signal })
      .then(async (response) => {
        const parsed = response.ok ? noteSchema.safeParse(await response.json()) : null;
        setLoaded(
          parsed?.success
            ? {
                id: activeId,
                state: "ready",
                content: parsed.data.content ?? "",
                isPdf: parsed.data.mimeType === "application/pdf",
              }
            : { id: activeId, state: "error" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: activeId, state: "error" });
      });
    return () => controller.abort();
  }, [activeId]);

  const current = loaded?.id === activeId ? loaded : undefined;
  const active = sources.find((source) => source.id === activeId);

  return (
    <aside
      aria-label={t("Sources")}
      className="hidden w-[360px] shrink-0 flex-col border-l border-border-subtle bg-sidebar xl:flex"
    >
      <div className="flex flex-wrap gap-1.5 border-b border-border-subtle px-4 py-3">
        {sources.map((source, index) => (
          <button
            key={source.id}
            type="button"
            onClick={() => setSelectedId(source.id)}
            aria-pressed={source.id === activeId}
            className={`flex h-8 max-w-full items-center gap-1.5 rounded-radius-md border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              source.id === activeId
                ? "border-accent bg-accent-soft text-accent-soft-text"
                : "border-border bg-surface text-text hover:bg-subtle"
            }`}
          >
            <span className="font-mono text-[11px] font-semibold">{index + 1}</span>
            <span className="truncate">{source.title || t("Untitled")}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="truncate text-xs text-text-secondary">{active?.title}</span>
        {activeId && (
          <a
            href={`/notes/${activeId}`}
            className="shrink-0 text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {current?.state === "ready" && current.isPdf ? t("Open original PDF") : t("Open note")}
          </a>
        )}
      </div>
      <div className="mx-4 mb-4 min-h-0 flex-1 overflow-y-auto rounded-radius-lg border border-border bg-surface p-5">
        {!current ? (
          <p role="status" className="text-sm text-text-tertiary">{t("Loading...")}</p>
        ) : current.state === "error" || !current.content.trim() ? (
          <p className="text-sm text-text-tertiary">{t("No preview available for this source.")}</p>
        ) : (
          <MarkdownRenderer variant="chat">{current.content}</MarkdownRenderer>
        )}
      </div>
    </aside>
  );
}
