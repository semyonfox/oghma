"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowTopRightOnSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { z } from "zod";
import PreviewRenderer from "@/components/editor/preview-renderer";
import type { FlowItem, FlowLink, TopicBridge } from "@/lib/study-map/flow";
import type { StudyTopic } from "@/lib/study-map/types";
import { cardLabel, FilePreview, previewKind, readableExcerpt, weekLabel } from "./study-board-card";

export type ColouredTopic = StudyTopic & { colour: string; mapId: string; exam: string | null };
export interface PlacedItem {
  item: FlowItem;
  moduleName: string;
}

const contentSchema = z.object({ content: z.string().nullable().optional() });
const noteCache = new Map<string, Promise<string>>();
const linkClass = "flex w-full min-w-0 items-baseline gap-2 rounded-radius-md px-2 py-1 text-left text-sm text-text-secondary hover:bg-primary-500/5 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";
const smallButton = "inline-flex min-h-8 items-center gap-1.5 rounded-radius-md px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary-500";
export const primarySmall = `${smallButton} bg-primary-600 text-text-on-primary hover:bg-primary-700`;
export const secondarySmall = `${smallButton} border border-border-subtle bg-surface text-text hover:bg-primary-500/5`;
const sectionTitle = "mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";

function loadNote(noteId: string): Promise<string> {
  let request = noteCache.get(noteId);
  if (!request) {
    request = fetch(`/api/notes/${noteId}?fields=content`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this note");
        return contentSchema.parse(await response.json()).content ?? "";
      });
    // a failed load can be retried on the next open
    request.catch(() => noteCache.delete(noteId));
    noteCache.set(noteId, request);
  }
  return request;
}

/** forget cached bodies when the map refreshes after an edit elsewhere */
export function clearNoteCache() {
  noteCache.clear();
}

function NoteText({ noteId, fallback, clamp }: { noteId: string; fallback: string; clamp: boolean }) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    loadNote(noteId).then((text) => { if (current) setContent(text); }, () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [noteId]);
  if (failed) return <p className="text-sm text-text-secondary">{readableExcerpt(fallback) || "This note could not be loaded. Open it in the editor."}</p>;
  if (content === null) return <p role="status" className="text-sm text-text-tertiary">Loading note…</p>;
  // the card already shows the title, so a leading level-one heading would only repeat it
  const body = content.replace(/^\s*#\s+[^\n]*\n+/, "");
  return (
    <div className={`text-sm [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold ${clamp ? "max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]" : ""}`}>
      <PreviewRenderer content={body} noteId={noteId} />
    </div>
  );
}

function PdfPages({ item }: { item: FlowItem }) {
  const [pages, setPages] = useState(2);
  const material = item.material!;
  return (
    <div className="space-y-3">
      {Array.from({ length: pages }, (_, index) => (
        <div key={index} className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-radius-md border border-border-subtle bg-background">
          <FilePreview material={material} kind="pdf" pageNumber={index + 1} />
        </div>
      ))}
      <button type="button" className={secondarySmall} onClick={() => setPages((value) => value + 4)}>Show more pages</button>
    </div>
  );
}

/** the readable body of a card: rendered Markdown, PDF pages or an image */
export function ItemBody({ item, full }: { item: FlowItem; full: boolean }) {
  if (item.assignment) {
    const text = readableExcerpt(item.assignment.description?.replace(/<[^>]+>/g, " ") ?? "");
    return <p className={`text-sm leading-relaxed text-text-secondary ${full ? "" : "line-clamp-6"}`}>{text || "No brief has been imported for this assignment."}</p>;
  }
  const material = item.material;
  if (!material) return null;
  const preview = previewKind(material);
  if (preview === "pdf") {
    if (full) return <PdfPages item={item} />;
    return (
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-radius-md border border-border-subtle bg-background">
        <FilePreview material={material} kind="pdf" />
      </div>
    );
  }
  if (preview === "image") {
    return (
      <div className={`flex items-center justify-center overflow-hidden rounded-radius-md border border-border-subtle bg-background ${full ? "min-h-64" : "h-44"}`}>
        <FilePreview material={material} kind="image" />
      </div>
    );
  }
  if (material.isFile && !item.textVersionId) return <p className="text-sm text-text-secondary">{readableExcerpt(material.excerpt) || "Open the original to read this file."}</p>;
  return <NoteText noteId={item.textVersionId ?? material.noteId} fallback={material.excerpt} clamp={!full} />;
}

interface DetailProps {
  placed: PlacedItem;
  topics: Map<string, ColouredTopic>;
  links: FlowLink[];
  lookup: (ref: string) => PlacedItem | undefined;
  sources: FlowItem[];
  usedBy: FlowItem[];
  onGo: (ref: string) => void;
  onFollow: (topicId: string) => void;
}

/** topics, links, assignments: the relations shared by the preview and the reader */
export function ItemRelations({ placed, topics, links, lookup, sources, usedBy, onGo, onFollow }: DetailProps) {
  const { item } = placed;
  const outgoing = links.filter((link) => link.source === item.ref);
  const incoming = links.filter((link) => link.target === item.ref);
  const otherModule = (ref: string) => {
    const other = lookup(ref);
    return other && other.item.mapId !== item.mapId ? other.moduleName : null;
  };
  return (
    <>
      {item.tags.length > 0 && (
        <>
          <h4 className={`${sectionTitle} flex justify-between gap-2`}>
            Topics
            <span className="font-normal normal-case tracking-normal">{item.assignment ? "named in the brief" : "classified against the syllabus"}</span>
          </h4>
          <ul className="space-y-0.5">
            {item.tags.map((tag) => {
              const topic = topics.get(tag.topicId);
              if (!topic) return null;
              return (
                <li key={tag.topicId} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: topic.colour }} aria-hidden="true" />
                  <button type="button" className="min-w-0 truncate text-left font-medium hover:underline" onClick={() => onFollow(tag.topicId)}>{topic.name}</button>
                  <span className={`ml-auto shrink-0 text-xs ${tag.suggested ? "text-ai-700 dark:text-ai-300" : "text-text-tertiary"}`}>
                    {tag.relevance}{tag.probability !== null ? ` · ${Math.round(tag.probability * 100)}%` : ""}{tag.suggested ? " · suggested" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <>
          <h4 className={sectionTitle}>Links</h4>
          {outgoing.map((link) => {
            const target = lookup(link.target);
            if (!target) return null;
            const module = otherModule(link.target);
            return (
              <button key={link.id} type="button" className={linkClass} onClick={() => onGo(link.target)}>
                <span className="min-w-0 truncate">{link.label} → {target.item.title}</span>
                <span className="ml-auto shrink-0 text-xs text-text-tertiary">{link.origin === "yours" ? "yours" : "in note"}{module ? ` · ${module}` : ""}</span>
              </button>
            );
          })}
          {incoming.map((link) => {
            const source = lookup(link.source);
            if (!source) return null;
            const module = otherModule(link.source);
            return (
              <button key={link.id} type="button" className={linkClass} onClick={() => onGo(link.source)}>
                <span className="min-w-0 truncate">← {source.item.title}</span>
                <span className="ml-auto shrink-0 text-xs text-text-tertiary">backlink{module ? ` · ${module}` : ""}</span>
              </button>
            );
          })}
        </>
      )}
      {item.assignment && sources.length > 0 && (
        <>
          <h4 className={sectionTitle}>Draws on</h4>
          {sources.map((source) => (
            <button key={source.ref} type="button" className={linkClass} onClick={() => onGo(source.ref)}>
              <span className="min-w-0 truncate">{source.title}</span>
              <span className="ml-auto shrink-0 text-xs text-text-tertiary">
                {item.assignment!.noteIds.includes(source.id) || item.assignment!.noteIds.includes(source.textVersionId ?? "") ? "attached · " : ""}{weekLabel(source)}
              </span>
            </button>
          ))}
        </>
      )}
      {usedBy.length > 0 && (
        <>
          <h4 className={sectionTitle}>Assignments</h4>
          {usedBy.map((assignment) => (
            <button key={assignment.ref} type="button" className={linkClass} onClick={() => onGo(assignment.ref)}>
              <span className="min-w-0 truncate">↩ {assignment.title}</span>
              {assignment.assignment?.due_at && <span className="ml-auto shrink-0 text-xs text-text-tertiary">due {new Date(assignment.assignment.due_at).toLocaleDateString()}</span>}
            </button>
          ))}
        </>
      )}
    </>
  );
}

function weekSourceText(item: FlowItem): string {
  if (item.weekSource === "set") return "set by you";
  if (item.weekSource === "title") return "from its title";
  if (item.weekSource === "folder") return `from folder “${item.material?.folder ?? ""}”`;
  if (item.weekSource === "linked") return "after its attached material";
  return "no week found in its title or folder";
}

export function ItemHeader({ placed }: { placed: PlacedItem }) {
  const { item } = placed;
  return (
    <>
      <p className="text-xs text-text-tertiary">
        {cardLabel(item)} · {placed.moduleName} · <span title={weekSourceText(item)}>{weekLabel(item)}</span>
      </p>
      <h3 className="mt-1 break-words text-base font-semibold leading-snug">{item.title || "Untitled"}</h3>
    </>
  );
}

export function ItemActions({ item, onRead, onReview, onAssignment, children }: {
  item: FlowItem;
  onRead?: () => void;
  onReview: () => void;
  onAssignment: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {item.assignment ? (
        <button type="button" className={primarySmall} onClick={onAssignment}>Open assignment</button>
      ) : (
        <>
          {onRead && <button type="button" className={primarySmall} onClick={onRead}>Read here</button>}
          <Link href={`/notes/${item.id}`} className={secondarySmall}>
            Open in editor <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button type="button" className={secondarySmall} onClick={onReview}>Review topics</button>
        </>
      )}
      {children}
    </div>
  );
}

export function TrailPanel({ topic, moduleName, parentName, trail, stop, supporting, goesWith, bridges, topics, onStep, onGo, onFollow, onClose }: {
  topic: ColouredTopic;
  moduleName: string;
  parentName: string | null;
  trail: FlowItem[];
  stop: number;
  supporting: FlowItem[];
  goesWith: Array<{ topic: ColouredTopic; count: number }>;
  bridges: Array<{ topic: ColouredTopic; bridge: TopicBridge; moduleName: string; loaded: boolean }>;
  topics: Map<string, ColouredTopic>;
  onStep: (index: number) => void;
  onGo: (ref: string) => void;
  onFollow: (topicId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label={`${topic.name} through the course`}
      className="absolute left-3 top-3 z-30 flex max-h-[calc(100%-5.5rem)] w-[min(320px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-radius-xl border border-border-subtle bg-surface shadow-lg"
      style={{ borderTop: `3px solid ${topic.colour}` }}
    >
      <div className="flex items-start gap-2 px-4 pt-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: topic.colour }} aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{topic.name}</h3>
          <p className="text-xs text-text-tertiary">{moduleName}{parentName ? ` · ${parentName}` : ""}</p>
        </div>
        <button type="button" className="ml-auto rounded-radius-md p-1.5 text-text-tertiary hover:bg-primary-500/5 hover:text-text" onClick={onClose} aria-label="Stop following this topic">
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pb-4">
        <p className="mt-2 line-clamp-4 text-sm text-text-secondary">{topic.definition}</p>
        {topic.exam && <p className="mt-1.5 text-xs text-text-tertiary">{topic.exam}</p>}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-text-tertiary">
          <button type="button" className={secondarySmall} disabled={stop <= 0} onClick={() => onStep(stop - 1)}>‹ Previous</button>
          <span role="status">{trail.length ? `Stop ${stop + 1} of ${trail.length}` : "No core material yet"}</span>
          <button type="button" className={secondarySmall} disabled={stop >= trail.length - 1} onClick={() => onStep(stop + 1)}>Next ›</button>
        </div>
        <ol className="mt-2 space-y-0.5">
          {trail.map((item, index) => (
            <li key={item.ref}>
              <button
                type="button"
                aria-current={index === stop ? "step" : undefined}
                className={`flex w-full min-w-0 items-center gap-2 rounded-radius-md px-1.5 py-1 text-left text-sm ${index === stop ? "bg-primary-500/10 text-text" : "text-text-secondary hover:bg-primary-500/5"}`}
                onClick={() => onStep(index)}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: topic.colour }}>{index + 1}</span>
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="ml-auto shrink-0 text-xs text-text-tertiary">{item.assignment ? "assignment" : item.week === null ? "–" : `W${item.week}`}</span>
              </button>
            </li>
          ))}
        </ol>
        {supporting.length > 0 && (
          <>
            <h4 className={sectionTitle}>Also touches {topic.name}</h4>
            <div className="flex flex-wrap gap-1">
              {supporting.map((item) => (
                <button key={item.ref} type="button" className="max-w-full truncate rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary hover:text-text" onClick={() => onGo(item.ref)}>{item.title}</button>
              ))}
            </div>
          </>
        )}
        {goesWith.length > 0 && (
          <>
            <h4 className={sectionTitle}>Goes with</h4>
            <div className="flex flex-wrap gap-1">
              {goesWith.map(({ topic: other, count }) => (
                <button key={other.id} type="button" className="flex items-center gap-1.5 rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-secondary hover:text-text" onClick={() => onFollow(other.id)}>
                  <span className="h-2 w-2 rounded-full" style={{ background: other.colour }} aria-hidden="true" />
                  {other.name}
                  <span className="text-text-tertiary">{count} shared</span>
                </button>
              ))}
            </div>
          </>
        )}
        {bridges.length > 0 && (
          <>
            <h4 className={sectionTitle}>In other modules</h4>
            <div className="flex flex-wrap gap-1">
              {bridges.map(({ topic: other, bridge, moduleName: otherModule, loaded }) => (
                <button key={`${other.id}:${bridge.reason}`} type="button" className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-text-secondary hover:text-text" onClick={() => onFollow(other.id)} title={loaded ? undefined : "Shown in All modules"}>
                  <span className="h-2 w-2 rounded-full" style={{ background: topics.get(other.id)?.colour ?? other.colour }} aria-hidden="true" />
                  {other.name}
                  <span className="text-text-tertiary">{otherModule} · {bridge.reason === "same name" ? "same name" : `${bridge.count} linked`}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
