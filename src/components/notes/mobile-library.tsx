"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  DocumentIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileSheet from "@/components/navigation/mobile-sheet";
import MobileNoteActions, { mobileActionClass } from "./mobile-note-actions";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useLayoutStore from "@/lib/notes/state/layout";
import useGlobalSearchStore from "@/lib/global-search/state";
import { buildFileSpec, inferFileType } from "@/lib/notes/utils/file-spec";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { ROOT_ID, type TreeItemModel, type TreeModel } from "@/lib/notes/types/tree";
import { foldFinishedCourses } from "@/lib/notes/tree-topics";
import { tagsViewSchema, type TagsViewCourse, type TagsViewFile } from "@/lib/notes/tags-view";
import {
  branchRecency,
  orderOutline,
  shortEditedLabel,
  topicOutline,
  type OutlineOrder,
} from "@/lib/notes/mobile-outline";
import { topicColour } from "@/lib/study-map/topic-colours";
import { useTreeViewSettings } from "./sidebar/use-tree-view-settings";
import {
  useSidebarActions,
  type DeleteConfirmTarget,
} from "./sidebar/use-sidebar-actions";

const noop = () => {};
export function mobileFolderHref(path: string[]) {
  return path.length
    ? `/notes?folder=${encodeURIComponent(path.join("/"))}`
    : "/notes";
}

// opening a note unmounts the library, so the open branches wait here for the way back
let remembered: { generation: number; ids: Set<string> } | null = null;

/** ids from the top level down to the item's parent, from the loaded parent links */
export function ancestorPath(tree: TreeModel, id: string): string[] {
  const path: string[] = [];
  let parent = tree.items[id]?.data?.pid;
  for (let depth = 0; parent && parent !== ROOT_ID && depth < 100; depth += 1) {
    path.unshift(parent);
    parent = tree.items[parent]?.data?.pid;
  }
  return path;
}

// notes read without ".md" the way the desktop tree shows them, other files keep their extension
function displayTitle(item: TreeItemModel, fallback: string): string {
  const title = item.data?.title || fallback;
  return !item.isFolder && /\.md$/i.test(title) && title.length > 3 ? title.slice(0, -3) : title;
}

const rowClass =
  "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-radius-lg px-2 text-left text-[15px] text-text";
const groupClass = "ml-[17px] border-l border-border-subtle pl-2.5";

type TopicsState = { status: "loading" } | { status: "error" } | { status: "ready"; course: TagsViewCourse | null };

export default function MobileLibrary() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderPath = searchParams.get("folder") || "";
  const tree = useNoteTreeStore((s) => s.tree);
  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  const treeError = useNoteTreeStore((s) => s.error);
  const loadChildren = useNoteTreeStore((s) => s.loadChildren);
  const { view, updateView } = useTreeViewSettings();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const generation = useNoteTreeStore.getState().generation;
    return remembered?.generation === generation ? new Set(remembered.ids) : new Set();
  });
  const [target, setTarget] = useState("root");
  const [resolving, setResolving] = useState(false);
  const [invalidPath, setInvalidPath] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [libraryMenu, setLibraryMenu] = useState(false);
  const [create, setCreate] = useState<{ kind: "note" | "folder"; parentId: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<DeleteConfirmTarget>(null);
  const [uploading, setUploading] = useState(false);
  const [topics, setTopics] = useState<Record<string, TopicsState>>({});
  // edit times read against when the page opened, which is close enough for "4h"
  const [now] = useState(() => Date.now());
  const uploadInput = useRef<HTMLInputElement>(null);
  const { handleUploadFiles, handleBulkDeleteRequest, handleDeleteConfirm } =
    useSidebarActions({
      activeId: null,
      deleteConfirmTarget,
      setDeleteConfirmTarget,
      setSelectionAnchorId: noop,
      onDeleteSelectionCleared: () => {
        setSelectedIds(new Set());
        setSelecting(false);
      },
    });

  useEffect(() => {
    remembered = { generation: useNoteTreeStore.getState().generation, ids: expanded };
  }, [expanded]);

  // a deep link opens with its branch expanded, and new notes land in its last folder
  useEffect(() => {
    if (!initLoaded) return;
    let cancelled = false;
    const generation = useNoteTreeStore.getState().generation;
    const path = folderPath.split("/").filter(Boolean);
    setResolving(true);
    setInvalidPath(false);
    setTarget("root");
    void (async () => {
      let parent = ROOT_ID;
      for (const id of path) {
        await loadChildren(parent === ROOT_ID ? null : parent);
        if (cancelled || useNoteTreeStore.getState().generation !== generation) return;
        const items = useNoteTreeStore.getState().tree.items;
        if (!items[parent]?.children.includes(id) || !items[id]?.isFolder) {
          setInvalidPath(true);
          setResolving(false);
          return;
        }
        parent = id;
      }
      await loadChildren(parent === ROOT_ID ? null : parent);
      if (cancelled) return;
      if (path.length) {
        setExpanded((current) => new Set([...current, ...path]));
        setTarget(parent);
        requestAnimationFrame(() =>
          document.getElementById(`outline-${parent}`)?.scrollIntoView?.({ block: "center" }),
        );
      }
      setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initLoaded, folderPath, loadChildren]);

  // children of anything restored as open, so the way back from a note isn't a row of spinners
  useEffect(() => {
    if (!initLoaded) return;
    for (const id of expanded) {
      const item = useNoteTreeStore.getState().tree.items[id];
      if (item?.isFolder && !item.childrenLoaded) void loadChildren(id);
    }
  }, [initLoaded, expanded, loadChildren]);

  const order: OutlineOrder = view.sort;
  const recency = new Map<string, number>();
  const rootChildren = tree.items[ROOT_ID]?.children ?? [];
  const topicsAvailable = rootChildren.some((id) => tree.items[id]?.data?.hasStudyMap);
  const byTopic = view.group === "tags" && topicsAvailable;
  const { visible: activeRoots, hidden: finishedRoots } = foldFinishedCourses(
    rootChildren,
    (id) => tree.items[id]?.data?.course,
    // a deep link into a finished course still opens where it points
    { hide: view.hideFinished, keepIds: target !== ROOT_ID ? new Set([...ancestorPath(tree, target), target].slice(0, 1)) : undefined },
  );
  const pinned = Object.values(tree.items)
    .filter((item) => item.id !== ROOT_ID && item.data?.pinned === NOTE_PINNED.PINNED)
    .sort((left, right) => (left.data?.title ?? "").localeCompare(right.data?.title ?? ""));

  const fetchTopics = (rootId: string) => {
    setTopics((current) => ({
      ...current,
      [rootId]: current[rootId]?.status === "ready" ? current[rootId] : { status: "loading" },
    }));
    void fetch(`/api/tree/tags?root=${encodeURIComponent(rootId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Topics unavailable");
        return tagsViewSchema.parse(await response.json());
      })
      .then((body) =>
        setTopics((current) => ({
          ...current,
          [rootId]: { status: "ready", course: body.courses.find((course) => course.rootId === rootId) ?? null },
        })),
      )
      .catch(() => setTopics((current) => ({ ...current, [rootId]: { status: "error" } })));
  };

  // topics are read when a course opens in that view, and again whenever the view comes back
  useEffect(() => {
    if (!byTopic) return;
    for (const id of expanded) {
      if (tree.items[id]?.data?.hasStudyMap) fetchTopics(id);
    }
    // only on entering the view: later opens fetch from toggle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTopic]);

  // deep links and pinned folders expand courses without toggle(), so pick up
  // any open course that has no topics yet
  useEffect(() => {
    if (!byTopic) return;
    for (const id of expanded) {
      if (tree.items[id]?.data?.hasStudyMap && !topics[id]) fetchTopics(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTopic, expanded, tree.items]);

  const toggle = (key: string) => {
    const opening = !expanded.has(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!opening) return;
    const item = tree.items[key];
    if (byTopic && item?.data?.hasStudyMap) fetchTopics(key);
    else if (item?.isFolder && !item.childrenLoaded) void loadChildren(key);
  };
  const startCreate = (kind: "note" | "folder", parentId: string) => {
    setLibraryMenu(false);
    setActionId(null);
    setName("");
    setError("");
    setCreate({ kind, parentId });
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const startSelecting = () => {
    setLibraryMenu(false);
    setSelectedIds(new Set());
    setSelecting(true);
  };
  const openNote = (id: string, folderIds: string[]) => {
    router.push(`/notes/${id}${folderIds.length ? `?folder=${encodeURIComponent(folderIds.join("/"))}` : ""}`);
  };
  const submitCreate = async () => {
    if (!name.trim() || busy || !create) return;
    setBusy(true);
    setError("");
    const run = async () => {
      const note = await useNoteStore.getState().createNote({
        id: useNoteTreeStore.getState().genNewId(),
        title: name.trim(),
        content: create.kind === "folder" ? "" : "\n",
        isFolder: create.kind === "folder",
        pid: create.parentId === ROOT_ID ? undefined : create.parentId,
      });
      if (!note) throw new Error("Creation failed");
      setCreate(null);
      if (create.parentId !== ROOT_ID) setExpanded((current) => new Set([...current, create.parentId]));
      if (!note.isFolder) {
        useLayoutStore.getState().setPaneA(buildFileSpec(note));
        const parents = create.parentId === ROOT_ID
          ? []
          : [...ancestorPath(useNoteTreeStore.getState().tree, create.parentId), create.parentId];
        openNote(note.id, parents);
      }
    };
    await run()
      .catch(() => {
        setError(t("Could not complete that action. Please try again."));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const openItem = (item: TreeItemModel) => {
    const data = item.data;
    if (!data) return;
    const parents = ancestorPath(tree, item.id);
    if (data.bundle) {
      // a PDF and the note extracted from it open as one document, the note first
      const { bundle } = data;
      useLayoutStore.getState().setPaneA(
        bundle.noteId
          ? { fileId: bundle.noteId, fileType: "note", title: `${data.title}.md` }
          : { fileId: bundle.pdfId, fileType: "pdf", title: `${data.title}.pdf` },
      );
      openNote(bundle.noteId ?? bundle.pdfId, [...parents, item.id]);
      return;
    }
    useLayoutStore.getState().setPaneA(buildFileSpec(data));
    openNote(item.id, parents);
  };
  // a pinned folder can sit deep in a course, so the shortcut opens the outline down to it
  const reveal = (item: TreeItemModel) => {
    const path = [...ancestorPath(tree, item.id), item.id];
    setExpanded((current) => new Set([...current, ...path]));
    if (!item.childrenLoaded) void loadChildren(item.id);
    requestAnimationFrame(() =>
      document.getElementById(`outline-${item.id}`)?.scrollIntoView?.({ block: "center" }),
    );
  };
  const openTopicFile = (file: TagsViewFile) => {
    const { setPaneA } = useLayoutStore.getState();
    if (file.isFile && file.noteId) {
      setPaneA({ fileId: file.noteId, fileType: "note", title: `${file.title}.md` });
    } else {
      setPaneA({
        fileId: file.id,
        fileType: file.isFile ? inferFileType(file.title, file.mimeType) : "note",
        title: file.title,
      });
    }
    openNote(file.isFile && file.noteId ? file.noteId : file.id, []);
  };

  const meta = (time: number) =>
    // dates follow the phone's locale like the rest of the app, so an Irish phone reads "1 Nov"
    order === "recent" ? shortEditedLabel(time, now, undefined, t) : null;

  const renderItem = (item: TreeItemModel, level: number): ReactNode => {
    const data = item.data;
    const title = displayTitle(item, t("Untitled"));
    const isFolder = !!item.isFolder && !data?.bundle;
    const open = isFolder && expanded.has(item.id);
    const selected = selectedIds.has(item.id);
    // finished courses render a level down in their fold, so a course is a root child, not level 1
    const hasTopics = byTopic && rootChildren.includes(item.id) && !!data?.hasStudyMap;
    const fileIcon = data?.bundle || (data?.s3Key && inferFileType(data.title, data.mimeType, data.s3Key) !== "note")
      ? DocumentIcon
      : DocumentTextIcon;
    const Icon = fileIcon;
    const chevron = (
      <ChevronRightIcon
        className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        aria-hidden="true"
      />
    );
    const label = meta(branchRecency(tree, item.id, recency));
    return (
      <li
        key={item.id}
        id={`outline-${item.id}`}
        role="treeitem"
        aria-level={level}
        aria-label={title}
        aria-expanded={isFolder ? open : undefined}
        aria-selected={selecting ? selected : undefined}
        className="scroll-mt-24"
      >
        <div
          className={`flex items-center rounded-radius-lg ${target === item.id && !selecting ? "bg-accent-soft" : ""} ${selecting && selected ? "bg-subtle-hover" : ""}`}
        >
          {selecting && isFolder && (
            <button
              type="button"
              className="flex h-11 w-8 shrink-0 items-center justify-center"
              aria-label={t(open ? "Collapse {title}" : "Expand {title}", { title })}
              onClick={() => toggle(item.id)}
            >
              {chevron}
            </button>
          )}
          <button
            type="button"
            aria-label={selecting ? t("Select {title}", { title }) : undefined}
            aria-pressed={selecting ? selected : undefined}
            className={`${rowClass} ${level === 1 && isFolder ? "font-semibold" : ""}`}
            onClick={() => {
              if (selecting) toggleSelected(item.id);
              else if (isFolder) toggle(item.id);
              else openItem(item);
            }}
          >
            {selecting && (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent text-on-action" : "border-border-strong text-transparent"}`}
              >
                <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
            {!selecting && (isFolder ? chevron : <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />)}
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {data?.pinned === NOTE_PINNED.PINNED && (
              <StarIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-label={t("Pinned")} />
            )}
            {label && (
              <span className="shrink-0 text-[13px] tabular-nums text-text-tertiary">{label}</span>
            )}
          </button>
          {!selecting && (
            <button
              type="button"
              className="ui-icon-button -mr-1"
              aria-label={t("Options for {title}", { title })}
              aria-haspopup="dialog"
              onClick={() => setActionId(item.id)}
            >
              <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        {open && (
          <ul role="group" className={groupClass}>
            {hasTopics ? renderTopics(item.id, level) : renderChildren(item, level + 1)}
          </ul>
        )}
      </li>
    );
  };

  const statusRow = (text: string, role?: "status") => (
    <li role={role ?? "none"} className="flex min-h-11 items-center px-2 text-sm text-text-tertiary">
      {text}
    </li>
  );

  const renderChildren = (item: TreeItemModel, level: number): ReactNode => {
    if (!item.childrenLoaded) return statusRow(t("Loading..."), "status");
    const children = orderOutline(tree, item.children, order, recency);
    if (children.length === 0) return statusRow(t("Empty folder"));
    return children.map((child) => renderItem(child, level));
  };

  const renderTopics = (rootId: string, level: number): ReactNode => {
    const state = topics[rootId];
    if (!state || state.status === "loading") return statusRow(t("Loading..."), "status");
    if (state.status === "error") {
      return (
        <li role="none" className="flex min-h-11 items-center gap-2 px-2 text-sm text-text-secondary">
          <span role="alert">{t("Topics could not be loaded.")}</span>
          <button type="button" className="min-h-11 px-2 font-medium text-accent" onClick={() => fetchTopics(rootId)}>
            {t("Retry")}
          </button>
        </li>
      );
    }
    const groups = state.course ? topicOutline(state.course, order) : [];
    if (groups.length === 0) return statusRow(t("No study map sorts these files into topics yet."));
    return groups.map((group) => {
      const key = `${rootId}|${group.key}`;
      const open = expanded.has(key);
      const name =
        group.kind === "review" ? t("To review") : group.kind === "untagged" ? t("Not tagged yet") : group.name;
      return (
        <li key={key} role="treeitem" aria-level={level + 1} aria-label={name} aria-expanded={open}>
          <button type="button" className={rowClass} onClick={() => toggle(key)}>
            <ChevronRightIcon
              className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            {group.kind === "topic" && group.topicIndex !== null ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: topicColour(group.topicIndex) }}
                aria-hidden="true"
              />
            ) : group.kind === "review" ? (
              <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-text-tertiary" aria-hidden="true" />
            ) : null}
            <span className={`min-w-0 flex-1 truncate ${group.kind === "untagged" ? "text-text-secondary" : ""}`}>{name}</span>
            <span className="shrink-0 pr-1 text-[13px] tabular-nums text-text-tertiary">{group.files.length}</span>
          </button>
          {open && (
            <ul role="group" className={groupClass}>
              {group.files.map((file) => {
                const time = file.editedAt ? Date.parse(file.editedAt) : 0;
                const label = meta(Number.isFinite(time) ? time : 0);
                const FileGlyph = file.isFile ? DocumentIcon : DocumentTextIcon;
                return (
                  <li key={file.id} role="treeitem" aria-level={level + 2} aria-label={file.title}>
                    <button type="button" className={rowClass} onClick={() => openTopicFile(file)}>
                      <FileGlyph className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{file.title}</span>
                      {label && <span className="shrink-0 text-[13px] tabular-nums text-text-tertiary">{label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      );
    });
  };

  const fold = (key: string, labelText: string, count: number, children: ReactNode, muted = false) => {
    const open = expanded.has(key);
    return (
      <li role="treeitem" aria-level={1} aria-label={labelText} aria-expanded={open}>
        <button type="button" className={`${rowClass} ${muted ? "text-text-secondary" : "font-semibold"}`} onClick={() => toggle(key)}>
          <ChevronRightIcon
            className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{labelText}</span>
          <span className="shrink-0 pr-1 text-[13px] font-normal tabular-nums text-text-tertiary">{count}</span>
        </button>
        {open && <ul role="group" className={groupClass}>{children}</ul>}
      </li>
    );
  };

  const outline = orderOutline(tree, activeRoots, order, recency);
  const finished = orderOutline(tree, finishedRoots, order, recency);
  const createParent = create && create.parentId !== ROOT_ID ? tree.items[create.parentId]?.data?.title : null;
  const segment = (active: boolean) =>
    `min-h-[38px] flex-1 rounded-radius-md px-3 text-sm ${active ? "atlas-raised font-semibold text-text" : "font-medium text-text-secondary"}`;

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
      <MobileAppHeader
        title={t("Notes")}
        actions={
          !selecting && (
            <>
              <button
                type="button"
                onClick={() => useGlobalSearchStore.getState().open()}
                aria-label={t("Search OghmaNotes")}
                title={t("Search OghmaNotes")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-text hover:bg-subtle-hover"
              >
                <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => startCreate("note", target)}
                disabled={!initLoaded || resolving || invalidPath || busy || uploading}
                aria-label={t("New note")}
                title={t("New note")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-action text-on-action hover:bg-action-hover disabled:opacity-50"
              >
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )
        }
      />
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        {selecting ? (
          <>
            <button
              type="button"
              onClick={() => {
                setSelecting(false);
                setSelectedIds(new Set());
              }}
              className="-ml-2 min-h-11 rounded-radius-lg px-2 text-sm font-semibold text-text-secondary hover:bg-subtle"
            >
              {t("Cancel")}
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
              {t("{count} selected", { count: selectedIds.size })}
            </span>
            <button
              type="button"
              disabled={selectedIds.size === 0 || busy}
              onClick={() => handleBulkDeleteRequest([...selectedIds])}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-radius-xl bg-error-600 px-3 text-sm font-semibold text-text-on-primary hover:bg-error-700 disabled:opacity-50"
            >
              <TrashIcon className="h-5 w-5" aria-hidden="true" />
              {t("Trash")}
            </button>
          </>
        ) : (
          <>
            {/* each control only shows once it would change something */}
            {topicsAvailable && (
              <div role="group" aria-label={t("View")} className="flex gap-1 rounded-radius-lg bg-subtle p-[3px]">
                <button type="button" aria-pressed={!byTopic} className={segment(!byTopic)} onClick={() => updateView({ group: "folders" })}>
                  {t("Folders")}
                </button>
                <button type="button" aria-pressed={byTopic} className={segment(byTopic)} onClick={() => updateView({ group: "tags" })}>
                  {t("Topics")}
                </button>
              </div>
            )}
            <span className="flex-1" />
            {rootChildren.length > 0 && (
              <label className="relative flex shrink-0 items-center">
                <span className="sr-only">{t("Order")}</span>
                <select
                  value={order}
                  onChange={(event) => updateView({ sort: event.target.value === "recent" ? "recent" : "name" })}
                  className="min-h-11 appearance-none rounded-radius-lg bg-transparent pl-2 pr-7 text-sm font-medium text-text-secondary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="name">{t("Course order")}</option>
                  <option value="recent">{t("Recent")}</option>
                </select>
                <ChevronUpDownIcon className="pointer-events-none absolute right-1.5 h-4 w-4 text-text-tertiary" aria-hidden="true" />
              </label>
            )}
            <button
              type="button"
              onClick={() => setLibraryMenu(true)}
              className="ui-icon-button -mr-2"
              aria-label={t("Library options")}
              aria-haspopup="dialog"
            >
              <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {(busy && !create) || uploading ? (
        <p role="status" className="shrink-0 px-5 pb-1 text-sm text-text-tertiary">
          {t(uploading ? "Uploading files..." : "Loading...")}
        </p>
      ) : null}
      <div className="mobile-dock-clearance shrink-0 px-2 pb-5">
        {invalidPath ? (
          <div className="p-5 text-center">
            <p className="text-text-secondary">{t("This folder is no longer available.")}</p>
            <button
              type="button"
              className="mt-3 min-h-11 px-4 font-medium text-accent"
              onClick={() => router.replace("/notes")}
            >
              {t("Back to notes")}
            </button>
          </div>
        ) : treeError ? (
          <div className="p-5">
            <p role="alert" className="text-error-700 dark:text-error-300">
              {t("Failed to load folder contents")}
            </p>
            <button
              type="button"
              className={mobileActionClass}
              onClick={() => void useNoteTreeStore.getState().refreshTree()}
            >
              <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
              {t("Try again")}
            </button>
          </div>
        ) : !initLoaded ? (
          <p role="status" className="p-5 text-sm text-text-tertiary">{t("Loading...")}</p>
        ) : rootChildren.length === 0 ? (
          <div className="mx-auto max-w-xs px-5 py-14 text-center">
            <FolderIcon className="mx-auto mb-4 h-9 w-9 text-text-tertiary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t("A place for your notes")}</h2>
            <p className="mt-2 text-base leading-relaxed text-text-tertiary">
              {t("Create a note or add a folder to get started.")}
            </p>
          </div>
        ) : (
          <ul role="tree" aria-label={t(byTopic ? "Topics" : "Folders")} className="flex flex-col">
            {pinned.length > 0 && !selecting && (
              <>
                {fold(
                  "pinned",
                  t("Pinned"),
                  pinned.length,
                  pinned.map((item) => (
                    <li key={item.id} role="treeitem" aria-level={2} aria-label={displayTitle(item, t("Untitled"))}>
                      <button
                        type="button"
                        className={rowClass}
                        onClick={() => (item.isFolder && !item.data?.bundle ? reveal(item) : openItem(item))}
                      >
                        {item.isFolder && !item.data?.bundle ? (
                          <FolderIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        ) : (
                          <StarIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{displayTitle(item, t("Untitled"))}</span>
                      </button>
                    </li>
                  )),
                  true,
                )}
                <li role="none" aria-hidden="true" className="mx-2 my-1.5 h-px bg-border-subtle" />
              </>
            )}
            {outline.map((item) => renderItem(item, 1))}
            {finished.length > 0 && (
              <>
                <li role="none" aria-hidden="true" className="mx-2 my-1.5 h-px bg-border-subtle" />
                {fold("finished", t("Finished courses"), finished.length, finished.map((item) => renderItem(item, 2)), true)}
              </>
            )}
          </ul>
        )}
      </div>
      <MobileNoteActions
        noteId={actionId}
        title={actionId && tree.items[actionId] ? displayTitle(tree.items[actionId], t("Untitled")) : undefined}
        onClose={() => setActionId(null)}
      >
        {actionId && ancestorPath(tree, actionId).length > 0 && (
          <p className="truncate px-3 pb-2 text-sm text-text-tertiary">
            {ancestorPath(tree, actionId)
              .map((id) => tree.items[id]?.data?.title || t("Untitled"))
              .join(" › ")}
          </p>
        )}
        {actionId && tree.items[actionId]?.isFolder && !tree.items[actionId]?.data?.bundle && (
          <>
            <button type="button" className={mobileActionClass} onClick={() => startCreate("note", actionId)}>
              <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
              {t("New note here")}
            </button>
            <button type="button" className={mobileActionClass} onClick={() => startCreate("folder", actionId)}>
              <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
              {t("New folder here")}
            </button>
          </>
        )}
      </MobileNoteActions>
      <MobileSheet open={libraryMenu} onClose={() => setLibraryMenu(false)} title={t("Library options")}>
        <button type="button" className={mobileActionClass} onClick={() => startCreate("note", target)} disabled={invalidPath}>
          <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
          {t("New note")}
        </button>
        <button type="button" className={mobileActionClass} onClick={() => startCreate("folder", target)} disabled={invalidPath}>
          <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
          {t("New folder")}
        </button>
        {rootChildren.length > 0 && !byTopic && (
          <button type="button" className={mobileActionClass} onClick={startSelecting}>
            <CheckIcon className="h-5 w-5" aria-hidden="true" />
            {t("Select items")}
          </button>
        )}
        <button
          type="button"
          className={mobileActionClass}
          disabled={busy || uploading}
          onClick={() => {
            setLibraryMenu(false);
            uploadInput.current?.click();
          }}
        >
          <ArrowUpTrayIcon className="h-5 w-5" aria-hidden="true" />
          {t("Upload files")}
        </button>
      </MobileSheet>
      <input
        ref={uploadInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length) {
            setUploading(true);
            void handleUploadFiles(files).finally(() => setUploading(false));
          }
        }}
      />
      <MobileSheet
        open={create !== null}
        onClose={() => {
          if (!busy) setCreate(null);
        }}
        title={t(create?.kind === "folder" ? "New folder" : "New note")}
      >
        <form
          className="space-y-4 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreate();
          }}
        >
          <label className="block text-sm font-medium">
            {t("Name")}
            <input
              autoFocus
              required
              maxLength={255}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-radius-xl border border-border bg-background px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          {createParent && (
            <p className="flex items-center gap-1.5 text-sm text-text-tertiary">
              <FolderIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("In {folder}", { folder: createParent })}</span>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-error-700 dark:text-error-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-radius-xl px-4 hover:bg-subtle"
              disabled={busy}
              onClick={() => setCreate(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-radius-xl bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
              disabled={busy || !name.trim()}
            >
              {t(busy ? "Creating..." : "Create")}
            </button>
          </div>
        </form>
      </MobileSheet>
      <MobileSheet
        open={deleteConfirmTarget !== null}
        onClose={() => setDeleteConfirmTarget(null)}
        title={t("Move to Trash")}
      >
        <div className="space-y-5 p-2">
          <p className="text-text-secondary">
            {deleteConfirmTarget?.mode === "bulk"
              ? t("The selected items will be moved to Trash. Folders include their contents.")
              : t("You can restore this from Trash.")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-radius-xl px-4 hover:bg-subtle"
              onClick={() => setDeleteConfirmTarget(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-radius-xl bg-error-600 px-4 font-semibold text-text-on-primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void handleDeleteConfirm().finally(() => setBusy(false));
              }}
            >
              {t("Move to Trash")}
            </button>
          </div>
        </div>
      </MobileSheet>
    </div>
  );
}
