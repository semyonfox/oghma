"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronRightIcon,
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
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useGlobalSearchStore from "@/lib/global-search/state";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
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

export default function MobileLibrary() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderPath = searchParams.get("folder") || "";
  const path = useMemo(
    () => folderPath.split("/").filter(Boolean),
    [folderPath],
  );
  const folderId = path.at(-1) || "root";
  const tree = useNoteTreeStore((s) => s.tree);
  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  const treeError = useNoteTreeStore((s) => s.error);
  const loadChildren = useNoteTreeStore((s) => s.loadChildren);
  const [resolving, setResolving] = useState(false);
  const [invalidPath, setInvalidPath] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [libraryMenu, setLibraryMenu] = useState(false);
  const [createKind, setCreateKind] = useState<"note" | "folder" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<DeleteConfirmTarget>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const loading = useNoteTreeStore((s) => s.loadingChildren.has(folderId));
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
    if (!initLoaded) return;
    let cancelled = false;
    const generation = useNoteTreeStore.getState().generation;
    setResolving(true);
    setInvalidPath(false);
    setPinnedOnly(false);
    setSelecting(false);
    setSelectedIds(new Set());
    void (async () => {
      let parent = "root";
      for (const id of path) {
        await loadChildren(parent === "root" ? null : parent);
        if (cancelled || useNoteTreeStore.getState().generation !== generation)
          return;
        const items = useNoteTreeStore.getState().tree.items;
        if (!items[parent]?.children.includes(id) || !items[id]?.isFolder) {
          setInvalidPath(true);
          setResolving(false);
          return;
        }
        parent = id;
      }
      await loadChildren(parent === "root" ? null : parent);
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initLoaded, path, loadChildren]);

  const items = useMemo(() => {
    const ids = pinnedOnly
      ? Object.keys(tree.items).filter(
          (id) => tree.items[id].data?.pinned === NOTE_PINNED.PINNED,
        )
      : tree.items[folderId]?.children || [];
    return ids
      .map((id) => tree.items[id])
      .filter((item) => !!item && item.id !== "root")
      .sort((a, b) => Number(!!b.isFolder) - Number(!!a.isFolder));
  }, [folderId, pinnedOnly, tree]);
  const startCreate = (kind: "note" | "folder") => {
    setLibraryMenu(false);
    setName("");
    setError("");
    setCreateKind(kind);
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
  const create = async () => {
    if (!name.trim() || busy || !createKind) return;
    setBusy(true);
    setError("");
    try {
      const note = await useNoteStore.getState().createNote({
        id: useNoteTreeStore.getState().genNewId(),
        title: name.trim(),
        content: createKind === "folder" ? "" : "\n",
        isFolder: createKind === "folder",
        pid: folderId === "root" ? undefined : folderId,
      });
      if (!note) throw new Error("Creation failed");
      setCreateKind(null);
      if (!note.isFolder) {
        useLayoutStore.getState().setPaneA(buildFileSpec(note));
        router.push(
          `/notes/${note.id}${folderPath ? `?folder=${encodeURIComponent(folderPath)}` : ""}`,
        );
      }
    } catch {
      setError(t("Could not complete that action. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const openItem = (id: string) => {
    const item = tree.items[id];
    if (item.isFolder) {
      // Pinned folders may sit outside the displayed branch; find their loaded ancestry.
      const parents: string[] = [];
      let cursor = id;
      const seen = new Set<string>();
      while (cursor !== "root" && !seen.has(cursor)) {
        seen.add(cursor);
        parents.unshift(cursor);
        cursor =
          Object.values(tree.items).find((candidate) =>
            candidate.children.includes(cursor),
          )?.id || "root";
      }
      router.push(mobileFolderHref(parents));
    } else if (item.data) {
      useLayoutStore.getState().setPaneA(buildFileSpec(item.data));
      router.push(
        `/notes/${id}${folderPath ? `?folder=${encodeURIComponent(folderPath)}` : ""}`,
      );
    }
  };
  return (
    <div className="flex h-full flex-col">
      <MobileAppHeader
        title={t("Notes")}
        actions={
          !selecting && (
            <button
              type="button"
              onClick={() => startCreate("note")}
              disabled={
                !initLoaded || resolving || invalidPath || busy || uploading
              }
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              {t("New note")}
            </button>
          )
        }
      />
      <div className="shrink-0 space-y-4 px-5 pb-4">
        <button
          type="button"
          onClick={() => useGlobalSearchStore.getState().open()}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 text-base text-text-tertiary hover:border-border"
        >
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
          {t("Search OghmaNotes")}
        </button>
        <div className="flex items-center gap-2">
          {selecting ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setSelectedIds(new Set());
                }}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-text-secondary hover:bg-subtle"
              >
                {t("Cancel")}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                {t("{count} selected", { count: selectedIds.size })}
              </span>
            </div>
          ) : path.length > 0 ? (
            <button
              type="button"
              onClick={() => router.push(mobileFolderHref(path.slice(0, -1)))}
              className="-ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left font-semibold hover:bg-subtle"
            >
              <ArrowLeftIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {tree.items[folderId]?.data?.title || t("Folder")}
              </span>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 gap-1" aria-label={t("Notes")}>
              <button
                type="button"
                aria-pressed={!pinnedOnly}
                onClick={() => setPinnedOnly(false)}
                className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${!pinnedOnly ? "bg-subtle text-text" : "text-text-tertiary"}`}
              >
                {t("All notes")}
              </button>
              <button
                type="button"
                aria-pressed={pinnedOnly}
                onClick={() => setPinnedOnly(true)}
                className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${pinnedOnly ? "bg-subtle text-text" : "text-text-tertiary"}`}
              >
                {t("Pinned")}
              </button>
            </div>
          )}
          {selecting ? (
            <button
              type="button"
              disabled={selectedIds.size === 0 || busy}
              onClick={() => handleBulkDeleteRequest([...selectedIds])}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-error-600 px-3 text-sm font-semibold text-white hover:bg-error-700 disabled:opacity-50"
            >
              <TrashIcon className="h-5 w-5" aria-hidden="true" />
              {t("Trash")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setLibraryMenu(true)}
                className="ui-icon-button"
                aria-label={t("Library options")}
                aria-haspopup="dialog"
              >
                <EllipsisHorizontalIcon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </button>
            </>
          )}
        </div>
        {busy && !createKind && (
          <p role="status" className="px-1 text-sm text-text-tertiary">
            {t("Loading...")}
          </p>
        )}
        {uploading && (
          <p role="status" className="px-1 text-sm text-text-tertiary">
            {t("Uploading files...")}
          </p>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5"
        key={folderPath}
      >
        {invalidPath ? (
          <div className="p-5 text-center">
            <p className="text-text-secondary">
              {t("This folder is no longer available.")}
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 px-4 font-medium text-primary-700 dark:text-primary-300"
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
        ) : resolving || loading || !initLoaded ? (
          <p role="status" className="p-5 text-sm text-text-tertiary">
            {t("Loading...")}
          </p>
        ) : items.length === 0 ? (
          <div className="mx-auto max-w-xs px-5 py-14 text-center">
            <FolderIcon
              className="mx-auto mb-4 h-9 w-9 text-text-tertiary"
              aria-hidden="true"
            />
            <h2 className="text-lg font-semibold">
              {t(pinnedOnly ? "No pinned notes" : "A place for your notes")}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-text-tertiary">
              {t(
                pinnedOnly
                  ? "Pin a note from its options to keep it close."
                  : "Create a note or add a folder to get started.",
              )}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center rounded-xl hover:bg-subtle/60"
              >
                <button
                  type="button"
                  aria-label={
                    selecting
                      ? t("Select {title}", {
                          title: item.data?.title || t("Untitled"),
                        })
                      : undefined
                  }
                  aria-pressed={
                    selecting ? selectedIds.has(item.id) : undefined
                  }
                  className={`flex min-h-[76px] min-w-0 flex-1 items-center gap-3 px-2 py-3 text-left ${selecting && selectedIds.has(item.id) ? "bg-primary-500/10" : ""}`}
                  onClick={() =>
                    selecting ? toggleSelected(item.id) : openItem(item.id)
                  }
                >
                  {selecting && (
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selectedIds.has(item.id) ? "border-primary-600 bg-primary-600 text-white" : "border-border text-transparent"}`}
                    >
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.isFolder ? "bg-primary-500/10 text-primary-600 dark:text-primary-300" : "bg-subtle text-text-tertiary"}`}
                  >
                    {item.isFolder ? (
                      <FolderIcon className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <DocumentTextIcon
                        className="h-5 w-5"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-text">
                      {item.data?.title || t("Untitled")}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-text-tertiary">
                      {item.data?.pinned === NOTE_PINNED.PINNED && (
                        <StarIcon
                          className="h-3.5 w-3.5"
                          aria-label={t("Pinned")}
                        />
                      )}
                      {t(
                        item.isFolder
                          ? "Folder"
                          : item.data?.s3Key
                            ? "Document"
                            : "Note",
                      )}
                    </span>
                  </span>
                  {item.isFolder && (
                    <ChevronRightIcon
                      className="h-4 w-4 shrink-0 text-text-tertiary"
                      aria-hidden="true"
                    />
                  )}
                </button>
                {!selecting && (
                  <button
                    type="button"
                    className="ui-icon-button mr-1 shrink-0"
                    aria-label={t("Options for {title}", {
                      title: item.data?.title || t("Untitled"),
                    })}
                    aria-haspopup="dialog"
                    onClick={() => setActionId(item.id)}
                  >
                    <EllipsisHorizontalIcon
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <MobileNoteActions noteId={actionId} onClose={() => setActionId(null)} />
      <MobileSheet
        open={libraryMenu}
        onClose={() => setLibraryMenu(false)}
        title={t("Library options")}
      >
        <button
          type="button"
          className={mobileActionClass}
          onClick={() => startCreate("note")}
          disabled={invalidPath}
        >
          <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
          {t("New note")}
        </button>
        <button
          type="button"
          className={mobileActionClass}
          onClick={() => startCreate("folder")}
          disabled={invalidPath}
        >
          <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
          {t("New folder")}
        </button>
        {items.length > 0 && (
          <button
            type="button"
            className={mobileActionClass}
            onClick={startSelecting}
          >
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
        open={createKind !== null}
        onClose={() => {
          if (!busy) setCreateKind(null);
        }}
        title={t(createKind === "folder" ? "New folder" : "New note")}
      >
        <form
          className="space-y-4 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
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
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="text-sm text-error-700 dark:text-error-300"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 hover:bg-subtle"
              disabled={busy}
              onClick={() => setCreateKind(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-primary-600 px-5 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
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
              ? t(
                  "The selected items will be moved to Trash. Folders include their contents.",
                )
              : t("You can restore this from Trash.")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 hover:bg-subtle"
              onClick={() => setDeleteConfirmTarget(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl bg-error-600 px-4 font-semibold text-white"
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
