"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useSaveIndicatorStore, { saveIndicatorKey } from "@/lib/notes/state/save-indicator";
import useTagEditorStore, { type TagTarget } from "@/lib/notes/state/tag-editor";
import {
  addTagLine,
  normaliseTagInput,
  readLinkedMaps,
  readNoteContent,
  rebaseTopicChoices,
  removeTagLine,
  saveTopicChoices,
  tagNamesSchema,
  topicEditFor,
  writeNoteContent,
  type LinkedMap,
  type TopicEdit,
} from "@/lib/notes/tag-editing";
import {
  applyBulkToggle,
  bulkTopicState,
  chooseTopic,
  isTicked,
  keepSuggestion,
  moveToTopic,
  untickTopic,
  type BulkState,
  type TopicChoices,
} from "@/lib/notes/tree-topics";
import { extractTags } from "@/lib/notes/utils/file-spec";
import { TopicDot } from "./topic-marks";

/** topic edits change tree marks and the Tags view, so both listen for this */
export const TOPICS_CHANGED_EVENT = "note-topics-changed";

export function announceTopicsChanged(targets: readonly TagTarget[]) {
  const tree = useNoteTreeStore.getState();
  const parents = new Set(targets.map((target) => tree.tree.items[target.id]?.data?.pid ?? null));
  for (const parent of parents) void tree.refreshChildren(parent).catch(() => {});
  window.dispatchEvent(new CustomEvent(TOPICS_CHANGED_EVENT));
}

const rowClass = "flex min-h-11 items-center gap-2 rounded-radius-md px-2 md:min-h-8";
const smallButton =
  "inline-flex min-h-11 items-center rounded-radius-sm px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 md:min-h-6";

function Checkbox({
  state,
  disabled,
  label,
  onChange,
}: {
  state: BulkState;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "on"}
      aria-checked={state === "mixed" ? "mixed" : state === "on"}
      aria-label={label}
      disabled={disabled}
      onChange={onChange}
      className="h-4 w-4 shrink-0 accent-primary-600"
    />
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="py-2">
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** E1a: one file's topics in one map */
function TopicBlock({
  edit,
  busy,
  onSave,
}: {
  edit: TopicEdit;
  busy: boolean;
  onSave: (choices: TopicChoices) => void;
}) {
  const { t } = useI18n();
  const hasMain = (except: string) =>
    Object.entries(edit.choices).some(([id, choice]) => id !== except && choice === "core");
  return (
    <Section title={t("{name} topics", { name: edit.mapName })}>
      <ul>
        {edit.topics.map((topic, index) => {
          const choice = edit.choices[topic.id];
          const ticked = isTicked(choice);
          const suggested = !ticked && choice !== "excluded" ? edit.suggestions[topic.id] : undefined;
          return (
            <li key={topic.id} className={`${rowClass} hover:bg-subtle`}>
              <Checkbox
                state={ticked ? "on" : "off"}
                disabled={busy}
                label={topic.name}
                onChange={() =>
                  onSave(
                    ticked
                      ? untickTopic(edit.choices, topic.id)
                      : chooseTopic(edit.choices, topic.id, hasMain(topic.id) ? "supporting" : "core"),
                  )
                }
              />
              {suggested && (
                <TopicDot
                  mark={{ mapId: edit.mapId, topicId: topic.id, name: topic.name, topicIndex: index, main: false, suggested: true }}
                  className="h-2 w-2"
                />
              )}
              <span className="min-w-0 flex-1 break-words text-sm text-text-secondary md:text-[13px]">{topic.name}</span>
              {ticked && (
                <span className="flex shrink-0 rounded-radius-sm bg-subtle p-0.5" role="group" aria-label={topic.name}>
                  {(["core", "supporting"] as const).map((relevance) => (
                    <button
                      key={relevance}
                      type="button"
                      disabled={busy}
                      aria-pressed={choice === relevance}
                      onClick={() => {
                        if (choice !== relevance) onSave(chooseTopic(edit.choices, topic.id, relevance));
                      }}
                      className={`${smallButton} ${
                        choice === relevance
                          ? "bg-surface text-text shadow-sm"
                          : "text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {relevance === "core" ? t("main") : t("also")}
                    </button>
                  ))}
                </span>
              )}
              {suggested && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSave(keepSuggestion(edit.choices, topic.id, suggested))}
                    className={`${smallButton} text-primary-700 hover:bg-primary-500/10 dark:text-primary-300`}
                  >
                    {t("Keep")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSave(untickTopic(edit.choices, topic.id))}
                    className={`${smallButton} text-text-tertiary hover:bg-subtle hover:text-text-secondary`}
                  >
                    {t("No")}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** E1b: several files in one course, one tri-state box per topic */
function BulkTopicBlock({
  edits,
  busy,
  onSave,
}: {
  edits: TopicEdit[];
  busy: boolean;
  onSave: (next: TopicChoices[]) => void;
}) {
  const { t } = useI18n();
  const first = edits[0];
  return (
    <Section title={t("{name} topics", { name: first.mapName })}>
      <ul>
        {first.topics.map((topic) => {
          const files = edits.map((edit) => edit.choices);
          const { state, count, total } = bulkTopicState(files, topic.id);
          return (
            <li key={topic.id} className={`${rowClass} hover:bg-subtle`}>
              <Checkbox
                state={state}
                disabled={busy}
                label={topic.name}
                onChange={() => onSave(applyBulkToggle(files, topic.id))}
              />
              <span className="min-w-0 flex-1 break-words text-sm text-text-secondary md:text-[13px]">{topic.name}</span>
              {count > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-text-tertiary">
                  {t("{count} of {total}", { count, total })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function TagsSection({
  notes,
  contents,
  disabled,
  disabledReason,
  skipped,
  onToggle,
  onAdd,
}: {
  notes: string[];
  contents: Record<string, string>;
  disabled: boolean;
  disabledReason: string | null;
  skipped: number;
  onToggle: (tag: string, state: BulkState) => void;
  onAdd: (tag: string) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [known, setKnown] = useState<Array<{ tag: string; count: number }>>([]);
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/tree/tags/names", { signal: request.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? tagNamesSchema.parse(await response.json()).tags : []))
      .then((tags) => {
        if (!request.signal.aborted) setKnown(tags);
      })
      .catch(() => {});
    return () => request.abort();
  }, []);

  const tagsByNote = notes.map((id) => extractTags(contents[id]));
  const present = [...new Set(tagsByNote.flat())].sort();
  const query = value.trim().toLowerCase();
  const matches = query
    ? known.filter((entry) => entry.tag.includes(query) && !present.includes(entry.tag)).slice(0, 5)
    : [];
  const exact = known.some((entry) => entry.tag === query) || present.includes(query);

  const add = (tag: string) => {
    if (!tag || disabled) return;
    onAdd(tag);
    setValue("");
  };

  return (
    <Section title={t("Your tags")}>
      <div className={disabled && notes.length === 0 ? "opacity-60" : undefined}>
        {present.length > 0 && (
          <ul>
            {present.map((tag) => {
              const count = tagsByNote.filter((tags) => tags.includes(tag)).length;
              const state: BulkState = count === notes.length ? "on" : "mixed";
              return (
                <li key={tag} className={`${rowClass} hover:bg-subtle`}>
                  <Checkbox state={state} disabled={disabled} label={`#${tag}`} onChange={() => onToggle(tag, state)} />
                  <span className="min-w-0 flex-1 break-words text-sm text-text-secondary md:text-[13px]">#{tag}</span>
                  {notes.length > 1 && (
                    <span className="shrink-0 text-xs tabular-nums text-text-tertiary">
                      {t("{count} of {total}", { count, total: notes.length })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-2 pt-1">
          <label htmlFor={inputId} className="sr-only">
            {t("Add a #tag")}
          </label>
          <input
            id={inputId}
            value={value}
            disabled={disabled}
            onChange={(event) => setValue(normaliseTagInput(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(query);
              }
            }}
            placeholder={t("Add a #tag")}
            autoComplete="off"
            className="min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 text-base text-text placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed md:min-h-8 md:text-[13px]"
          />
          {query && !disabled && (
            <ul className="mt-1 rounded-radius-md border border-border-subtle bg-surface py-1">
              {matches.map((entry) => (
                <li key={entry.tag}>
                  <button type="button" onClick={() => add(entry.tag)} className={`${rowClass} w-full text-left hover:bg-subtle`}>
                    <span className="min-w-0 flex-1 truncate text-sm text-text md:text-[13px]">#{entry.tag}</span>
                    <span className="shrink-0 text-xs text-text-tertiary">
                      {t("{count} notes", { count: entry.count })}
                    </span>
                  </button>
                </li>
              ))}
              {!exact && (
                <li>
                  <button type="button" onClick={() => add(query)} className={`${rowClass} w-full text-left text-sm text-primary-700 hover:bg-subtle dark:text-primary-300 md:text-[13px]`}>
                    {t("Create #{tag}", { tag: query })}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
        {disabledReason && <p className="px-2 pt-1.5 text-xs text-text-tertiary">{disabledReason}</p>}
        {skipped > 0 && (
          <p className="px-2 pt-1.5 text-xs text-text-tertiary">
            {t("{count} files have no text yet, so they keep no tags", { count: skipped })}
          </p>
        )}
      </div>
    </Section>
  );
}

function TagEditorPanel({
  targets,
  anchor,
  onClose,
}: {
  targets: TagTarget[];
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(anchor);
  const single = targets.length === 1;
  const oneCourse = single || targets.every((target) => target.courseId !== null && target.courseId === targets[0].courseId);
  const noteIds = [...new Set(targets.flatMap((target) => (target.noteId ? [target.noteId] : [])))];

  const [maps, setMaps] = useState<Record<string, LinkedMap[]> | null>(null);
  const [contents, setContents] = useState<Record<string, string> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsaved = useSaveIndicatorStore((store) =>
    noteIds.some((id) =>
      [store.files[id], store.files[saveIndicatorKey(id, "B")]].some(
        (indicator) => indicator && (indicator.ready === false || indicator.state !== "saved"),
      ),
    ),
  );

  useEffect(() => {
    const request = new AbortController();
    const load = async () => {
      const [linked, texts] = await Promise.all([
        oneCourse
          ? Promise.all(targets.map(async (target) => [target.id, await readLinkedMaps(target.materialId, request.signal)] as const))
          : Promise.resolve([]),
        Promise.all(noteIds.map(async (id) => [id, await readNoteContent(id, request.signal)] as const)),
      ]);
      if (request.signal.aborted) return;
      setMaps(Object.fromEntries(linked));
      setContents(Object.fromEntries(texts));
    };
    void load().catch(() => {
      if (!request.signal.aborted) setLoadError(true);
    });
    return () => request.abort();
    // targets are fixed for this panel's lifetime, it remounts when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const pad = 8;
    setPosition({
      x: Math.max(pad, Math.min(anchor.x, window.innerWidth - rect.width - pad)),
      y: Math.max(pad, Math.min(anchor.y, window.innerHeight - rect.height - pad)),
    });
  }, [anchor, maps, contents]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    await work()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t("This change could not be saved. Try again."));
      })
      .finally(() => setBusy(false));
  };

  const reloadMaps = async (changed: readonly TagTarget[]) => {
    const entries = await Promise.all(
      changed.map(async (target) => [target.id, await readLinkedMaps(target.materialId)] as const),
    );
    setMaps((current) => ({ ...current, ...Object.fromEntries(entries) }));
    announceTopicsChanged(changed);
  };

  // blocks in the order maps first appear across the selection
  const mapIds = maps ? [...new Set(targets.flatMap((target) => (maps[target.id] ?? []).map((entry) => entry.mapId)))] : [];
  const editsFor = (mapId: string) =>
    targets.flatMap((target) => {
      const entry = maps?.[target.id]?.find((candidate) => candidate.mapId === mapId);
      return entry ? [{ target, edit: topicEditFor(entry) }] : [];
    });

  const saveTopics = (changes: Array<{ target: TagTarget; edit: TopicEdit; choices: TopicChoices }>) =>
    void run(async () => {
      for (const change of changes) await saveTopicChoices(change.edit, change.choices);
      await reloadMaps(changes.map((change) => change.target));
    });

  const writeTags = (update: (content: string, noteId: string) => string | null) =>
    void run(async () => {
      if (!contents) return;
      const next = { ...contents };
      const changed: TagTarget[] = [];
      for (const noteId of noteIds) {
        const content = update(contents[noteId] ?? "", noteId);
        if (content === null || content === contents[noteId]) continue;
        await writeNoteContent(noteId, content, "tag-editor");
        next[noteId] = content;
        changed.push(...targets.filter((target) => target.noteId === noteId));
      }
      setContents(next);
      for (const target of changed) {
        const before = maps?.[target.id];
        if (before?.length) await rebaseTopicChoices(before, target.materialId);
      }
      if (maps && changed.length) await reloadMaps(changed);
      else window.dispatchEvent(new CustomEvent(TOPICS_CHANGED_EVENT));
    });

  const loose = targets.filter((target) => !target.noteId).length;
  const tagsDisabled = busy || !contents || unsaved || noteIds.length === 0;
  const tagsReason =
    noteIds.length === 0
      ? t("Extract text to add your own tags")
      : unsaved
        ? t("Save the note first, then edit its tags")
        : null;

  const title = single ? targets[0].title : t("{count} items", { count: targets.length });

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("Edit tags")}
      onClick={(event) => event.stopPropagation()}
      className={`fixed z-[10000] flex flex-col border border-border-subtle bg-surface text-text shadow-2xl ${
        isDesktop
          ? "max-h-[70dvh] w-80 rounded-radius-lg"
          : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-radius-xl pb-[env(safe-area-inset-bottom)]"
      }`}
      style={isDesktop && position ? { left: position.x, top: position.y } : undefined}
    >
      <div className="flex items-start gap-2 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold">{title}</h2>
          {single && targets[0].noteId && targets[0].noteId !== targets[0].materialId && (
            <p className="text-xs text-text-tertiary">{t("Tags apply to the PDF and its note")}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="ui-icon-button" aria-label={t("Close")} title={t("Close")}>
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-busy={busy || maps === null}>
        {loadError ? (
          <p role="alert" className="px-2 py-3 text-sm text-text-secondary">
            {t("Tags could not be loaded.")}
          </p>
        ) : maps === null && oneCourse ? (
          <p role="status" className="px-2 py-3 text-sm text-text-tertiary">
            {t("Loading tags...")}
          </p>
        ) : (
          <>
            {!oneCourse && (
              <p className="px-2 pt-2 text-xs text-text-tertiary">
                {t("Topics can be changed together only when every item is in one course.")}
              </p>
            )}
            {mapIds.map((mapId) => {
              const edits = editsFor(mapId);
              if (single) {
                const { target, edit } = edits[0];
                return (
                  <TopicBlock
                    key={mapId}
                    edit={edit}
                    busy={busy}
                    onSave={(choices) => saveTopics([{ target, edit, choices }])}
                  />
                );
              }
              return (
                <BulkTopicBlock
                  key={mapId}
                  edits={edits.map((entry) => entry.edit)}
                  busy={busy}
                  onSave={(next) =>
                    saveTopics(
                      edits.flatMap((entry, index) =>
                        next[index] === entry.edit.choices ? [] : [{ ...entry, choices: next[index] }],
                      ),
                    )
                  }
                />
              );
            })}
            {oneCourse && maps !== null && mapIds.length === 0 && (
              <p className="px-2 pt-2 text-xs text-text-tertiary">
                {single ? t("This file isn't in a study map.") : t("These files aren't in a study map.")}{" "}
                {single && (
                  <Link
                    href={`/study-map?note=${encodeURIComponent(targets[0].materialId)}`}
                    className="text-primary-700 underline decoration-primary-500/40 underline-offset-2 hover:decoration-primary-500 dark:text-primary-300"
                    onClick={onClose}
                  >
                    {t("Add to a study map")}
                  </Link>
                )}
              </p>
            )}
            <TagsSection
              notes={noteIds}
              contents={contents ?? {}}
              disabled={tagsDisabled}
              disabledReason={tagsReason}
              skipped={single ? 0 : loose}
              onToggle={(tag, state) =>
                writeTags((content) =>
                  state === "on"
                    ? removeTagLine(content, tag)
                    : extractTags(content).includes(tag)
                      ? null
                      : addTagLine(content, tag),
                )
              }
              onAdd={(tag) =>
                writeTags((content) => (extractTags(content).includes(tag) ? null : addTagLine(content, tag)))
              }
            />
          </>
        )}
        {error && (
          <p role="alert" className="px-2 pt-1 text-xs text-error-700 dark:text-error-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] bg-black/30 md:bg-transparent" onClick={onClose} aria-hidden="true" />
      {panel}
    </>,
    document.body,
  );
}

/** E1: edit the topics and #tags of one file or a selection */
export function TagEditor() {
  const targets = useTagEditorStore((state) => state.targets);
  const anchor = useTagEditorStore((state) => state.anchor);
  const close = useTagEditorStore((state) => state.close);
  if (targets.length === 0) return null;
  return (
    <TagEditorPanel
      key={targets.map((target) => target.id).join(",")}
      targets={targets}
      anchor={anchor}
      onClose={close}
    />
  );
}

/** "Move to topic" in the Tags view: exclude the current topic and add the new one, with undo */
export async function moveFileToTopic(
  target: TagTarget,
  mapId: string,
  fromTopicId: string,
  toTopicId: string,
  labels: { moved: string; undo: string; failed: string },
): Promise<void> {
  const entry = (await readLinkedMaps(target.materialId)).find((candidate) => candidate.mapId === mapId);
  if (!entry) throw new Error(labels.failed);
  const edit = topicEditFor(entry);
  await saveTopicChoices(edit, moveToTopic(edit.choices, fromTopicId, toTopicId));
  announceTopicsChanged([target]);
  toast.success(labels.moved, {
    action: {
      label: labels.undo,
      onClick: () => {
        void saveTopicChoices(edit, edit.choices)
          .then(() => announceTopicsChanged([target]))
          .catch(() => toast.error(labels.failed));
      },
    },
  });
}
