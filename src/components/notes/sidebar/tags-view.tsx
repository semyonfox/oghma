"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useGlobalSearchStore from "@/lib/global-search/state";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useTagEditorStore, { type TagTarget } from "@/lib/notes/state/tag-editor";
import {
  classificationProgressSchema,
  groupByKind,
  tagsViewSchema,
  type TagsViewData,
  type TagsViewFile,
  type TagsViewReview,
  type TagsViewTopic,
} from "@/lib/notes/tags-view";
import { isFinishedCourse } from "@/lib/notes/tree-topics";
import { topicColour } from "@/lib/study-map/topic-colours";
import { ROOT_ID } from "@/lib/notes/types/tree";
import {
  estimateClassification,
  initialEtaMemory,
  shouldPollProgress,
  showsProgress,
  type ClassificationProgress,
  type EtaLabel,
  type EtaMemory,
} from "@/lib/study-map/eta";
import type { DocumentKind } from "@/lib/study-map/types";
import { moveFileToTopic, TOPICS_CHANGED_EVENT } from "./tag-editor";
import { TopicDots } from "./topic-marks";

const POLL_MS = 3000;
const TOPICS_PER_COURSE = 5;
const rowClass =
  "group/row flex min-h-12 w-full items-center gap-1.5 rounded-radius-sm px-1.5 text-left text-text-secondary hover:bg-subtle hover:text-text md:min-h-7";

interface Course {
  id: string;
  title: string;
  academicYear: string | null;
  isCanvasCourse: boolean;
}

type Scope = { kind: "course"; id: string } | { kind: "all" };

function useCourses() {
  const tree = useNoteTreeStore((state) => state.tree);
  const courses = (tree.items[ROOT_ID]?.children ?? []).flatMap((id) => {
    const data = tree.items[id]?.data;
    if (!data?.isFolder || data.bundle) return [];
    return [{
      id,
      title: data.title,
      academicYear: data.course?.academicYear ?? null,
      isCanvasCourse: data.course?.isCanvasCourse === true,
      finished: isFinishedCourse(data.course),
    }];
  });
  return {
    active: courses.filter((course) => !course.finished),
    // newest first: the academic year from canvas, then the name
    finished: courses
      .filter((course) => course.finished)
      .sort(
        (left, right) =>
          (right.academicYear ?? "").localeCompare(left.academicYear ?? "") ||
          left.title.localeCompare(right.title),
      ),
  };
}

function etaText(label: EtaLabel, t: ReturnType<typeof useI18n>["t"]): string {
  if (label.kind === "estimating") return t("estimating");
  if (label.kind === "queued") return t("queued");
  if (label.kind === "reading") return t("reading PDFs");
  if (label.step === "under-minute") return t("under a minute left");
  if (label.step === "under-hour") return t("under an hour left");
  if (label.step === "over-hour") return t("over an hour left");
  return t("about {count} min left", { count: label.step });
}

/** P2b: a ring and "34/61" while files are sorted into topics, the estimate on hover */
function ProgressDial({ mapIds, onClassified }: { mapIds: string[]; onClassified: () => void }) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<ClassificationProgress | null>(null);
  const [label, setLabel] = useState<EtaLabel>({ kind: "estimating" });
  const memory = useRef<EtaMemory>(initialEtaMemory);
  const classified = useRef<number | null>(null);
  const onClassifiedRef = useRef(onClassified);
  useEffect(() => {
    onClassifiedRef.current = onClassified;
  }, [onClassified]);
  const key = mapIds.join(",");

  useEffect(() => {
    if (!key) return;
    const request = new AbortController();
    memory.current = initialEtaMemory;
    classified.current = null;
    let timer: number | undefined;
    const poll = async () => {
      const params = new URLSearchParams(key.split(",").map((id) => ["map", id]));
      const response = await fetch(`/api/study-maps/progress?${params}`, { signal: request.signal, cache: "no-store" });
      if (!response.ok) return;
      const body = classificationProgressSchema.parse(await response.json());
      if (request.signal.aborted) return;
      const next = estimateClassification(body, memory.current, Date.now());
      memory.current = next.memory;
      setProgress(body);
      setLabel(next.label);
      if (classified.current !== null && classified.current !== body.classified) onClassifiedRef.current();
      classified.current = body.classified;
      // poll only while a job can still finish, the way the study workspace does
      if (shouldPollProgress(body)) timer = window.setTimeout(() => void poll().catch(() => {}), POLL_MS);
    };
    void poll().catch(() => {});
    return () => {
      request.abort();
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!progress) return null;
  const failed =
    progress.failed > 0 ? (
      <span className="shrink-0 text-xs font-medium text-error-700 dark:text-error-400">
        {t("{count} failed", { count: progress.failed })}
      </span>
    ) : null;
  if (!showsProgress(progress)) return failed;

  const fraction = progress.total ? progress.classified / progress.total : 0;
  const circumference = 2 * Math.PI * 6;
  const description = `${t("Sorting into topics")} · ${etaText(label, t)}`;
  return (
    <span className="flex shrink-0 items-center gap-1.5" title={description}>
      <span className="sr-only">{description}</span>
      <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-border-subtle" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className="stroke-primary-500 transition-[stroke-dashoffset] duration-[2800ms] ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="text-xs tabular-nums text-text-tertiary">
        {progress.classified}/{progress.total}
      </span>
      {failed}
    </span>
  );
}

function FileIcon({ file }: { file: TagsViewFile }) {
  return file.isFile ? (
    <DocumentIcon className="h-4 w-4 shrink-0 text-red-400 md:h-3.5 md:w-3.5" aria-hidden="true" />
  ) : (
    <DocumentTextIcon className="h-4 w-4 shrink-0 text-text-tertiary md:h-3.5 md:w-3.5" aria-hidden="true" />
  );
}

function FileRow({
  file,
  topic,
  siblings,
  onOpen,
  onChanged,
  opensEditor = false,
  aside,
}: {
  file: TagsViewFile;
  topic: TagsViewTopic | null;
  siblings: TagsViewTopic[];
  onOpen: (file: TagsViewFile) => void;
  onChanged: () => void;
  /** Q1 rows open the tag popover, where Keep and No are waiting */
  opensEditor?: boolean;
  aside?: ReactNode;
}) {
  const { t } = useI18n();
  const target: TagTarget = {
    id: file.id,
    title: file.title,
    materialId: file.id,
    noteId: file.noteId,
    courseId: file.rootId,
  };
  const destinations = topic ? siblings.filter((candidate) => candidate.mapId === topic.mapId && candidate.topicId !== topic.topicId) : [];
  return (
    <li className="flex min-w-0 items-center pl-6">
      <button
        type="button"
        className={`${rowClass} min-w-0 flex-1`}
        onClick={(event) => {
          if (!opensEditor) return onOpen(file);
          const rect = event.currentTarget.getBoundingClientRect();
          useTagEditorStore.getState().open([target], { x: rect.left, y: rect.bottom + 4 });
        }}
        title={file.title}
      >
        <FileIcon file={file} />
        {topic && file.suggested && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ border: `1.5px solid ${topicColour(topic.topicIndex)}` }}
            aria-label={t("suggested")}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-base md:text-[13px]">{file.title}</span>
        {/* review rows give the room to their dots, the path is in the topic groups below */}
        {file.path && !aside && (
          <span className="max-w-[45%] shrink truncate text-xs text-text-tertiary/80">{file.path}</span>
        )}
        {aside}
      </button>
      <Popover className="shrink-0">
        <PopoverButton
          className="flex h-11 w-11 items-center justify-center rounded-radius-sm text-text-tertiary hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:h-6 md:w-6"
          aria-label={t("More actions")}
          title={t("More actions")}
        >
          <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden="true" />
        </PopoverButton>
        <PopoverPanel
          anchor="bottom end"
          className="z-[60] w-56 max-w-[calc(100vw-1rem)] rounded-radius-md border border-border-subtle bg-surface p-1 text-[13px] text-text shadow-lg [--anchor-gap:4px] [--anchor-padding:8px]"
        >
          {({ close }) => (
            <>
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-radius-sm px-2 text-left text-text-secondary hover:bg-subtle md:min-h-7"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  close();
                  useTagEditorStore.getState().open([target], { x: rect.left, y: rect.bottom + 4 });
                }}
              >
                {t("Edit tags")}
              </button>
              {topic && destinations.length > 0 && (
                <>
                  <p className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                    {t("Move to topic")}
                  </p>
                  {destinations.map((destination) => (
                    <button
                      key={destination.topicId}
                      type="button"
                      className="flex min-h-11 w-full items-center rounded-radius-sm px-2 text-left text-text-secondary hover:bg-subtle md:min-h-7"
                      onClick={() => {
                        close();
                        void moveFileToTopic(target, topic.mapId, topic.topicId, destination.topicId, {
                          moved: t("Moved to {topic}", { topic: destination.name }),
                          undo: t("Undo"),
                          failed: t("This change could not be saved. Try again."),
                        })
                          .then(onChanged)
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : t("This change could not be saved. Try again.")),
                          );
                      }}
                    >
                      <span className="truncate">{destination.name}</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </PopoverPanel>
      </Popover>
    </li>
  );
}

function Group({
  label,
  count,
  marker,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  count: number;
  marker?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li>
      <button type="button" className={rowClass} aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRightIcon className={`h-3 w-3 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        {marker}
        <span className="min-w-0 flex-1 truncate text-base md:text-[13px]">{label}</span>
        <span className="shrink-0 pr-1 text-xs tabular-nums text-text-tertiary">{count}</span>
      </button>
      {open && <ul>{children}</ul>}
    </li>
  );
}

function kindLabel(kind: DocumentKind, t: ReturnType<typeof useI18n>["t"]): string {
  if (kind === "slides") return t("Slides");
  if (kind === "past_paper") return t("Past papers");
  if (kind === "worked_example") return t("Worked examples");
  if (kind === "reading") return t("Reading");
  if (kind === "notes") return t("Your notes");
  if (kind === "syllabus") return t("Syllabus");
  return t("Other");
}

/** Q1: files with topics waiting for a decision. only there when something needs one */
function ReviewGroup({
  files,
  onOpen,
  onChanged,
}: {
  files: TagsViewReview[];
  onOpen: (file: TagsViewFile) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  if (files.length === 0) return null;
  return (
    <Group
      label={t("To review")}
      count={files.length}
      defaultOpen
      marker={<span className="h-1.5 w-1.5 shrink-0 rounded-full border-[1.5px] border-text-tertiary" aria-hidden="true" />}
    >
      {files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          topic={null}
          siblings={[]}
          onOpen={onOpen}
          onChanged={onChanged}
          opensEditor
          aside={
            <>
              {file.changed && <span className="shrink-0 text-xs text-text-tertiary">{t("changed")}</span>}
              <TopicDots marks={file.topics.map((topic) => ({ ...topic, main: false, suggested: true }))} />
            </>
          }
        />
      ))}
    </Group>
  );
}

function TopicGroups({
  course,
  limit,
  onOpen,
  onChanged,
}: {
  course: TagsViewData["courses"][number];
  limit: number | null;
  onOpen: (file: TagsViewFile) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const shown = limit !== null && !expanded ? course.topics.slice(0, limit) : course.topics;
  const hidden = course.topics.length - shown.length;
  return (
    <>
      {shown.map((topic) => {
        const kinds = groupByKind(topic.files);
        return (
          <Group
            key={`${topic.mapId}:${topic.topicId}`}
            label={topic.name}
            count={topic.files.length}
            marker={
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: topicColour(topic.topicIndex) }}
                aria-hidden="true"
              />
            }
          >
            {kinds.map((group) => (
              <Fragment key={group.kind}>
                {kinds.length > 1 && (
                  <li className="pb-0.5 pl-8 pt-1.5 text-[11px] text-text-tertiary">{kindLabel(group.kind, t)}</li>
                )}
                {group.files.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    topic={topic}
                    siblings={course.topics}
                    onOpen={onOpen}
                    onChanged={onChanged}
                  />
                ))}
              </Fragment>
            ))}
          </Group>
        );
      })}
      {hidden > 0 && (
        <li>
          <button type="button" className={`${rowClass} pl-6 text-xs text-text-tertiary`} onClick={() => setExpanded(true)}>
            {t("+{count} more", { count: hidden })}
          </button>
        </li>
      )}
    </>
  );
}

function ScopeMenu({
  scope,
  active,
  finished,
  onChange,
}: {
  scope: Scope | null;
  active: Course[];
  finished: Course[];
  onChange: (scope: Scope) => void;
}) {
  const { t } = useI18n();
  const [showFinished, setShowFinished] = useState(false);
  const all = [...active, ...finished];
  const label =
    scope?.kind === "all"
      ? t("All active courses")
      : (all.find((course) => course.id === scope?.id)?.title ?? t("Choose a course"));
  const option = (key: string, text: string, checked: boolean, pick: () => void, close: () => void) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={() => {
        pick();
        close();
      }}
      className="flex min-h-11 w-full items-center gap-2 rounded-radius-md px-2.5 text-left text-sm text-text-secondary hover:bg-subtle hover:text-text md:min-h-8 md:text-[13px]"
    >
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <CheckIcon className={`h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300 ${checked ? "" : "invisible"}`} aria-hidden="true" />
    </button>
  );
  return (
    <Popover className="min-w-0 flex-1">
      <PopoverButton className="flex min-h-11 w-full min-w-0 items-center gap-1 rounded-radius-md px-1.5 text-left text-sm font-medium text-text hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:min-h-8 md:text-[13px]">
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom start"
        role="menu"
        className="z-[60] max-h-[60dvh] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-radius-lg border border-border-subtle bg-surface p-1 text-text shadow-lg [--anchor-gap:6px] [--anchor-padding:8px]"
      >
        {({ close }) => (
          <>
            <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{t("Active")}</p>
            {active.map((course) =>
              option(course.id, course.title, scope?.kind === "course" && scope.id === course.id, () => onChange({ kind: "course", id: course.id }), close),
            )}
            {option("all", t("All active courses"), scope?.kind === "all", () => onChange({ kind: "all" }), close)}
            {finished.length > 0 && (
              <>
                <div className="my-1 h-px bg-border-subtle" />
                <button
                  type="button"
                  aria-expanded={showFinished}
                  onClick={() => setShowFinished(!showFinished)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-radius-md px-2.5 text-left text-sm text-text-secondary hover:bg-subtle md:min-h-8 md:text-[13px]"
                >
                  <span className="flex-1">{t("{count} finished courses", { count: finished.length })}</span>
                  <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform ${showFinished ? "rotate-90" : ""}`} aria-hidden="true" />
                </button>
                {showFinished && (
                  <div className="pl-2">
                    {finished.map((course) =>
                      option(course.id, course.title, scope?.kind === "course" && scope.id === course.id, () => onChange({ kind: "course", id: course.id }), close),
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}

/** S1: the user's #tags and study-map topics for one course, or all active ones */
export function TagsView({
  activeRootId,
  onOpenFile,
}: {
  activeRootId: string | null;
  onOpenFile: (file: TagsViewFile) => void;
}) {
  const { t } = useI18n();
  const { active, finished } = useCourses();
  const [picked, setPicked] = useState<Scope | null>(null);
  const [data, setData] = useState<TagsViewData | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  const known = new Set([...active, ...finished].map((course) => course.id));
  // defaults to the course of the open note, otherwise the first canvas course
  const fallback = active.find((course) => course.isCanvasCourse) ?? active[0];
  const scope: Scope | null =
    picked && (picked.kind === "all" || known.has(picked.id))
      ? picked
      : activeRootId && known.has(activeRootId)
        ? { kind: "course", id: activeRootId }
        : fallback
          ? { kind: "course", id: fallback.id }
          : finished[0]
            ? { kind: "course", id: finished[0].id }
            : null;
  const rootIds = scope?.kind === "all" ? active.map((course) => course.id) : scope ? [scope.id] : [];
  const rootKey = rootIds.join(",");

  useEffect(() => {
    const refresh = () => setReload((current) => current + 1);
    window.addEventListener(TOPICS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TOPICS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!rootKey) return;
    const request = new AbortController();
    const params = new URLSearchParams(rootKey.split(",").map((id) => ["root", id]));
    void fetch(`/api/tree/tags?${params}`, { signal: request.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Tags unavailable");
        return tagsViewSchema.parse(await response.json());
      })
      .then((body) => {
        if (request.signal.aborted) return;
        setData(body);
        setError(false);
      })
      .catch(() => {
        if (!request.signal.aborted) setError(true);
      });
    return () => request.abort();
  }, [rootKey, reload]);

  const refresh = () => setReload((current) => current + 1);
  const courses = data?.courses.filter((course) => rootIds.includes(course.rootId)) ?? [];
  const mapIds = courses.flatMap((course) => course.maps.map((map) => map.id));
  const untagged = courses.flatMap((course) => course.untagged);
  const review = courses.flatMap((course) => course.review);

  return (
    <div className="flex flex-col pb-4">
      <div className="flex min-h-12 items-center gap-2 px-2 md:min-h-9">
        <ScopeMenu scope={scope} active={active} finished={finished} onChange={setPicked} />
        {mapIds.length > 0 && <ProgressDial mapIds={mapIds} onClassified={refresh} />}
        {/* no second search box: Ctrl+K already matches titles, text, meaning and topic names */}
        <button
          type="button"
          onClick={() => useGlobalSearchStore.getState().open()}
          aria-label={t("Search everything")}
          title={`${t("Search everything")} (Ctrl+K)`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 md:h-7 md:w-7"
        >
          <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {!scope ? (
        <p className="px-3 py-2 text-sm text-text-tertiary md:text-xs">{t("Make a folder or import a course to see its tags here.")}</p>
      ) : error ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <p role="alert" className="text-sm text-text-secondary md:text-xs">{t("Tags could not be loaded.")}</p>
          <button type="button" onClick={refresh} className="min-h-11 rounded-radius-md px-2 text-sm text-primary-700 hover:bg-subtle dark:text-primary-300 md:min-h-7 md:text-xs">
            {t("Retry")}
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="px-3 py-2 text-sm text-text-tertiary md:text-xs">{t("Loading tags...")}</p>
      ) : (
        <ul className="px-0.5">
          <ReviewGroup files={review} onOpen={onOpenFile} onChanged={refresh} />
          {data.tags.map((entry) => (
            <Group key={entry.tag} label={`#${entry.tag}`} count={entry.files.length}>
              {entry.files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  topic={null}
                  siblings={[]}
                  onOpen={onOpenFile}
                  onChanged={refresh}
                />
              ))}
            </Group>
          ))}

          {scope.kind === "all"
            ? courses.filter((course) => course.topics.length > 0).map((course) => (
                <li key={course.rootId} className="pt-2">
                  <p className="flex items-baseline gap-2 px-2 pb-0.5 text-xs font-semibold text-text-tertiary">
                    <span className="min-w-0 truncate">{course.title}</span>
                    <span className="shrink-0 font-normal">{t("{count} topics", { count: course.topics.length })}</span>
                  </p>
                  <ul>
                    <TopicGroups course={course} limit={TOPICS_PER_COURSE} onOpen={onOpenFile} onChanged={refresh} />
                  </ul>
                </li>
              ))
            : courses.map((course) => (
                <TopicGroups key={course.rootId} course={course} limit={null} onOpen={onOpenFile} onChanged={refresh} />
              ))}

          {mapIds.length === 0 && (
            <li className="px-3 py-2 text-sm text-text-tertiary md:text-xs">
              {t("No study map sorts these files into topics yet.")}{" "}
              <Link href="/study-map" className="text-primary-700 underline decoration-primary-500/40 underline-offset-2 hover:decoration-primary-500 dark:text-primary-300">
                {t("Open study maps")}
              </Link>
            </li>
          )}

          {untagged.length > 0 && (
            <Group label={t("Not tagged yet")} count={untagged.length}>
              {untagged.map((file) => (
                <FileRow key={file.id} file={file} topic={null} siblings={[]} onOpen={onOpenFile} onChanged={refresh} />
              ))}
            </Group>
          )}
        </ul>
      )}
    </div>
  );
}
