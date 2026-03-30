"use client";

import { FC } from "react";
import { NoteModel } from "@/lib/notes/types/note";
import {
  InformationCircleIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import dynamic from "next/dynamic";

const ChatInterface = dynamic(
  () => import("@/components/chat/chat-interface"),
  { ssr: false },
);

interface PropertiesPanelProps {
  note?: NoteModel;
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  backlinks?: Array<{ id: string; title: string }>;
  outgoingLinks?: Array<{ id: string; title: string }>;
}

export const PropertiesPanel: FC<PropertiesPanelProps> = ({
  note,
  tags = [],
  onTagsChange,
  backlinks = [],
  outgoingLinks = [],
}) => {
  const { t } = useI18n();
  const { rightPanelTab, setRightPanelTab } = useLayoutStore();

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return t("Unknown");
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-full bg-background border-l border-border flex flex-col overflow-hidden">
      {/* Tab header */}
      <div className="flex-shrink-0 flex items-center gap-0.5 px-2 py-2 border-b border-border">
        <button
          onClick={() => setRightPanelTab("meta")}
          title={t("Info")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
            rightPanelTab === "meta"
              ? "bg-white/8 text-text-secondary"
              : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
          }`}
        >
          <InformationCircleIcon className="w-3.5 h-3.5" />
          {t("Info")}
        </button>
        <button
          onClick={() => setRightPanelTab("ai")}
          title={t("AI Assistant")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
            rightPanelTab === "ai"
              ? "bg-primary-600/20 text-primary-300"
              : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
          }`}
        >
          <CpuChipIcon className="w-3.5 h-3.5" />
          {t("AI")}
        </button>
      </div>

      {/* AI tab */}
      {rightPanelTab === "ai" && (
        <div className="flex-1 min-h-0">
          <ChatInterface compact noteId={note?.id} noteTitle={note?.title} />
        </div>
      )}

      {/* Info tab — meta (top half) + tags (bottom half), each independently scrollable */}
      {rightPanelTab === "meta" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Metadata — top 50% */}
          <div className="flex-1 overflow-y-auto p-3 border-b border-border min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              {t("Metadata")}
            </p>
            <div className="space-y-2 text-xs">
              {note?.date && (
                <div>
                  <span className="text-text-tertiary block">
                    {t("Last Updated")}
                  </span>
                  <span className="text-text-secondary font-mono text-[11px]">
                    {formatDate(note.date)}
                  </span>
                </div>
              )}
              {note?.id && (
                <div>
                  <span className="text-text-tertiary block">{t("ID")}</span>
                  <span className="text-text-tertiary font-mono text-[11px] break-all">
                    {note.id}
                  </span>
                </div>
              )}
              {outgoingLinks.length > 0 && (
                <div>
                  <span className="text-text-tertiary block mb-1">
                    {t("Links")} ({outgoingLinks.length})
                  </span>
                  <ul className="space-y-0.5">
                    {outgoingLinks.map((link) => (
                      <li key={link.id}>
                        <a
                          href={`#${link.id}`}
                          className="text-blue-400 hover:text-blue-300 transition-colors truncate block"
                          title={link.title}
                        >
                          → {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {backlinks.length > 0 && (
                <div>
                  <span className="text-text-tertiary block mb-1">
                    {t("Backlinks")} ({backlinks.length})
                  </span>
                  <ul className="space-y-0.5">
                    {backlinks.map((link) => (
                      <li key={link.id}>
                        <a
                          href={`#${link.id}`}
                          className="text-green-400 hover:text-green-300 transition-colors truncate block"
                          title={link.title}
                        >
                          ← {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!note?.date &&
                !note?.id &&
                outgoingLinks.length === 0 &&
                backlinks.length === 0 && (
                  <p className="text-text-tertiary italic">
                    {t("No metadata")}
                  </p>
                )}
            </div>
          </div>

          {/* Tags — bottom 50% */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              {t("Tags")}
            </p>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-600/15 text-primary-300 rounded text-xs"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        onTagsChange?.(tags.filter((t) => t !== tag))
                      }
                      className="hover:text-primary-200 transition-colors ml-0.5 leading-none"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-tertiary italic">
                {t("No tags yet")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesPanel;
