"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  normalizeNoteActivityRefs,
  type MessagePart,
  type NoteActivityRef,
  type SearchContextData,
} from "@/lib/chat/types";

type NoteActivity = NoteActivityRef & { action: "found" | "read" };

export function collectNoteActivity(
  parts: MessagePart[],
  searchContext?: SearchContextData,
): NoteActivity[] {
  const notes = new Map<string, NoteActivity>();
  for (const note of normalizeNoteActivityRefs(
    searchContext?.results.map((result) => ({
      id: result.noteId,
      title: result.title,
    })),
  )) {
    notes.set(note.id, { ...note, action: "found" });
  }
  for (const part of parts) {
    if (
      part.type !== "tool" ||
      part.status === "failed" ||
      part.status === "interrupted"
    )
      continue;
    const action =
      part.name === "readNote"
        ? "read"
        : part.name === "getChunks"
          ? "found"
          : null;
    if (!action) continue;
    const refs = part.notes?.length
      ? part.notes
      : part.name === "readNote" && part.resultDetail
        ? normalizeNoteActivityRefs([{ id: part.detail, title: part.resultDetail }])
        : [];
    for (const note of refs) {
      const previous = notes.get(note.id);
      notes.set(note.id, {
        ...note,
        action:
          action === "read" || previous?.action === "read" ? "read" : "found",
      });
    }
  }
  return [...notes.values()].sort((a, b) =>
    a.action === b.action ? 0 : a.action === "read" ? -1 : 1,
  );
}

export function WorkLog({
  parts,
  searchContext,
  active = false,
  hasAnswer = false,
}: {
  parts: MessagePart[];
  searchContext?: SearchContextData;
  active?: boolean;
  hasAnswer?: boolean;
}) {
  const { t } = useI18n();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const notes = collectNoteActivity(parts, searchContext);
  const readCount = notes.filter((note) => note.action === "read").length;
  const foundIds = new Set(
    normalizeNoteActivityRefs(
      searchContext?.results.map((result) => ({
        id: result.noteId,
        title: result.title,
      })),
    ).map((note) => note.id),
  );
  for (const part of parts) {
    if (part.type === "tool" && part.name === "getChunks" && part.status === "completed") {
      for (const note of part.notes ?? []) foundIds.add(note.id);
    }
  }
  const searched = Boolean(searchContext) || parts.some(
    (part) => part.type === "tool" &&
      (part.name === "getChunks" || part.name === "ragSearch") &&
      part.status === "completed",
  );
  const running = [...parts]
    .reverse()
    .find(
      (part): part is Extract<MessagePart, { type: "tool" }> =>
        part.type === "tool" && part.status === "running",
    );
  const showProgress = active && !hasAnswer && (running || notes.length === 0);

  if (notes.length === 0 && !showProgress && !searched) return null;

  const summary = [
    foundIds.size > 0
      ? t(foundIds.size === 1 ? "Found {count} note" : "Found {count} notes", {
          count: foundIds.size,
        })
      : null,
    readCount > 0
      ? t(readCount === 1 ? "Read {count} note" : "Read {count} notes", {
          count: readCount,
        })
      : null,
  ].filter(Boolean).join(" · ") || t("No matching notes");
  const label = showProgress
    ? running?.name === "getChunks" || running?.name === "ragSearch"
      ? t("Searching notes...")
      : running?.name === "readNote"
        ? t("Reading a note...")
        : running
          ? t("Working…")
          : t("Thinking…")
    : summary;

  return (
    <div className="py-1 text-sm text-text-tertiary">
      {notes.length > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-11 items-center gap-2 rounded-radius-sm text-left hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 lg:min-h-8"
        >
          {showProgress ? (
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-tertiary/25 border-t-text-tertiary motion-reduce:animate-none" />
          ) : (
            <DocumentTextIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{label}</span>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div
          className="flex min-h-11 items-center gap-2 lg:min-h-8"
          role="status"
        >
          {showProgress && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-tertiary/25 border-t-text-tertiary motion-reduce:animate-none" />}
          <span>{label}</span>
        </div>
      )}
      {expanded && notes.length > 0 && (
        <ul
          id={panelId}
          className="ml-2 space-y-1 border-l border-border-subtle pl-4 pb-1"
        >
          {notes.map((note) => (
            <li key={note.id} className="flex min-w-0 items-center gap-2">
              <Link
                href={`/notes/${note.id}`}
                className="min-w-0 truncate rounded-radius-sm py-1 text-text-secondary underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                title={note.title}
              >
                {note.title}
              </Link>
              <span className="shrink-0 text-xs text-text-tertiary/70">
                {t(note.action === "read" ? "Read" : "Found")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
