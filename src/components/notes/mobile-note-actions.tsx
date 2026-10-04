"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  FolderArrowDownIcon,
  PencilIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import MobileSheet from "@/components/navigation/mobile-sheet";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteStore from "@/lib/notes/state/note";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { NOTE_PINNED } from "@/lib/notes/types/meta";
import { wouldCreateTreeCycle } from "@/lib/notes/state/tree-cycle";
import {
  useSidebarActions,
  type DeleteConfirmTarget,
} from "./sidebar/use-sidebar-actions";

const noop = () => {};
export const mobileActionClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-text-secondary hover:bg-subtle disabled:opacity-50";
const primaryClass =
  "min-h-11 rounded-xl bg-primary-600 px-5 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function MobileNoteActions({
  noteId,
  title,
  onClose,
  children,
}: {
  noteId: string | null;
  title?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const tree = useNoteTreeStore((s) => s.tree);
  const item = noteId ? tree.items[noteId] : undefined;
  const [mode, setMode] = useState<"actions" | "rename" | "move">("actions");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteConfirmTarget>(null);
  const {
    handleDeleteRequest,
    handleDeleteConfirm,
    handleTogglePin,
    handleOpenInAIChat,
  } = useSidebarActions({
    activeId: pathname?.startsWith("/notes/") ? pathname.split("/")[2] : null,
    deleteConfirmTarget: deleteTarget,
    setDeleteConfirmTarget: setDeleteTarget,
    setSelectionAnchorId: noop,
    onDeleteSelectionCleared: noop,
  });
  useEffect(() => {
    setMode("actions");
    setError("");
    setDeleteTarget(null);
    setDestination([]);
  }, [noteId]);
  const folderId = destination.at(-1) ?? "root";
  const loadChildren = useNoteTreeStore((s) => s.loadChildren);
  const loading = useNoteTreeStore((s) => s.loadingChildren.has(folderId));
  useEffect(() => {
    if (noteId && mode === "move")
      void loadChildren(folderId === "root" ? null : folderId);
  }, [folderId, mode, noteId, loadChildren]);
  const close = () => {
    if (!busy) onClose();
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch {
      setError(t("Could not complete that action. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const heading = deleteTarget
    ? t("Move to Trash")
    : mode === "rename"
      ? t("Rename")
      : mode === "move"
        ? t("Move to folder")
        : title || item?.data?.title || t("Note options");
  return (
    <MobileSheet open={noteId !== null} onClose={close} title={heading}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-error-500/10 p-3 text-sm text-error-700 dark:text-error-300"
        >
          {error}
        </p>
      )}
      {deleteTarget ? (
        <div className="p-2">
          <p className="mb-5 text-text-secondary">
            <span className="font-medium">
              {item?.data?.title || title || t("Untitled")}
            </span>
            <br />
            {t("You can restore this from Trash.")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 hover:bg-subtle"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl bg-error-600 px-4 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void run(handleDeleteConfirm)}
            >
              {t("Move to Trash")}
            </button>
          </div>
        </div>
      ) : mode === "rename" ? (
        <form
          className="space-y-4 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (noteId && name.trim())
              void run(() =>
                useNoteStore
                  .getState()
                  .mutateNote(noteId, { title: name.trim() }),
              );
          }}
        >
          <label className="block text-sm font-medium">
            {t("Name")}
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              required
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 hover:bg-subtle"
              onClick={() => setMode("actions")}
              disabled={busy}
            >
              {t("Cancel")}
            </button>
            <button className={primaryClass} disabled={busy || !name.trim()}>
              {t(busy ? "Saving..." : "Save")}
            </button>
          </div>
        </form>
      ) : mode === "move" ? (
        <div>
          <button
            type="button"
            className={mobileActionClass}
            disabled={!destination.length || busy}
            onClick={() => setDestination((path) => path.slice(0, -1))}
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">
              {folderId === "root"
                ? t("Notes")
                : tree.items[folderId]?.data?.title || t("Folder")}
            </span>
          </button>
          <div className="my-2 max-h-64 overflow-y-auto border-y border-border-subtle">
            {loading ? (
              <p role="status" className="p-4 text-sm text-text-tertiary">
                {t("Loading...")}
              </p>
            ) : (
              (tree.items[folderId]?.children ?? [])
                .filter(
                  (id) =>
                    tree.items[id]?.isFolder &&
                    noteId &&
                    !wouldCreateTreeCycle(tree, noteId, id),
                )
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    className={mobileActionClass}
                    onClick={() => setDestination((path) => [...path, id])}
                  >
                    <FolderIcon
                      className="h-5 w-5 text-primary-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tree.items[id].data?.title || t("Folder")}
                    </span>
                    <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))
            )}
          </div>
          <div className="flex justify-end gap-2 p-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-4 hover:bg-subtle"
              onClick={() => setMode("actions")}
              disabled={busy}
            >
              {t("Cancel")}
            </button>
            <button
              className={primaryClass}
              disabled={
                busy ||
                loading ||
                !tree.items[folderId]?.childrenLoaded ||
                (item?.data?.pid || "root") === folderId
              }
              onClick={() => {
                if (noteId)
                  void run(() =>
                    useNoteTreeStore
                      .getState()
                      .moveItem({
                        noteId,
                        expectedParentId: item?.data?.pid || null,
                        parentId: folderId === "root" ? null : folderId,
                      }),
                  );
              }}
            >
              {t("Move here")}
            </button>
          </div>
        </div>
      ) : (
        <div aria-busy={busy}>
          {children}
          <button
            type="button"
            className={mobileActionClass}
            disabled={busy}
            onClick={() => {
              setName(item?.data?.title || title || "");
              setMode("rename");
            }}
          >
            <PencilIcon className="h-5 w-5" aria-hidden="true" />
            {t("Rename")}
          </button>
          <button
            type="button"
            className={mobileActionClass}
            disabled={busy || !item}
            onClick={() => setMode("move")}
          >
            <FolderArrowDownIcon className="h-5 w-5" aria-hidden="true" />
            {t("Move to folder")}
          </button>
          <button
            type="button"
            className={mobileActionClass}
            disabled={busy || !item}
            onClick={() => {
              if (noteId) void run(() => handleTogglePin(noteId));
            }}
          >
            <StarIcon className="h-5 w-5" aria-hidden="true" />
            {t(item?.data?.pinned === NOTE_PINNED.PINNED ? "Unpin" : "Pin")}
          </button>
          {!item?.isFolder && (
            <button
              type="button"
              className={mobileActionClass}
              disabled={busy}
              onClick={() => {
                if (noteId)
                  void run(async () => {
                    const state = useNoteStore.getState();
                    const source = await state.fetchNote(noteId);
                    if (!source) throw new Error("Note unavailable");
                    const copy = await state.createNote({
                      id: useNoteTreeStore.getState().genNewId(),
                      title: t("{title} (Copy)", { title: source.title }),
                      content: source.content || "\n",
                      pid: source.pid,
                    });
                    if (!copy) throw new Error("Copy failed");
                    router.push(`/notes/${copy.id}`);
                  });
              }}
            >
              <DocumentDuplicateIcon className="h-5 w-5" aria-hidden="true" />
              {t("Duplicate")}
            </button>
          )}
          <button
            type="button"
            className={mobileActionClass}
            disabled={busy}
            onClick={() => {
              if (noteId) {
                handleOpenInAIChat(noteId, item?.data, !!item?.isFolder);
                onClose();
              }
            }}
          >
            <SparklesIcon className="h-5 w-5" aria-hidden="true" />
            {t("Open AI chat")}
          </button>
          <div className="my-2 border-t border-border-subtle" />
          <button
            type="button"
            className={`${mobileActionClass} text-error-700 dark:text-error-300`}
            disabled={busy}
            onClick={() => {
              if (noteId) handleDeleteRequest(noteId);
            }}
          >
            <TrashIcon className="h-5 w-5" aria-hidden="true" />
            {t("Move to Trash")}
          </button>
          {busy && (
            <p className="px-3 py-2 text-sm text-text-tertiary" role="status">
              {t("Loading...")}
            </p>
          )}
        </div>
      )}
    </MobileSheet>
  );
}
