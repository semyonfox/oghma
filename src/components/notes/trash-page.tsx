"use client";

import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  DocumentIcon,
  FolderIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useNoteTreeStore from "@/lib/notes/state/tree";

export interface TrashRoot {
  id: string;
  title: string;
  isFolder: boolean;
  deletedAt: string;
  purgeAt: string;
  originalPath: string[];
  descendantCount: number;
}

type PendingAction =
  | { kind: "delete"; item: TrashRoot }
  | { kind: "empty" }
  | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_CHANGE_EVENT = "notes:trash-changed";

function daysUntil(purgeAt: string) {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY_MS));
}

function formatDate(date: string, locale: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function expiryTone(days: number) {
  if (days <= 3) {
    return "border-error-500/30 bg-error-500/10 text-error-300";
  }
  if (days <= 7) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-border-subtle bg-subtle text-text-tertiary";
}

function notifyTrashChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TRASH_CHANGE_EVENT));
  }
}

async function requestTrashAction(
  action: "restore" | "delete" | "empty",
  id?: string,
) {
  const response = await fetch("/api/trash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { action, id } : { action }),
  });

  if (!response.ok) {
    throw new Error(`Trash action failed: ${response.status}`);
  }
}

export default function TrashPage() {
  const { t, activeLocale } = useI18n();
  const refreshTree = useNoteTreeStore((state) => state.refreshTree);
  const [items, setItems] = useState<TrashRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const restoreButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const response = await fetch("/api/trash", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load trash: ${response.status}`);

      const data = (await response.json()) as { items?: TrashRoot[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (loadError) {
      console.error("Failed to load trash:", loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const focusAfterRemoval = useCallback(
    (itemId: string) => {
      const itemIndex = items.findIndex((item) => item.id === itemId);
      const nextItem = items[itemIndex + 1] ?? items[itemIndex - 1];

      window.requestAnimationFrame(() => {
        if (nextItem) {
          restoreButtonRefs.current.get(nextItem.id)?.focus();
          return;
        }
        headingRef.current?.focus();
      });
    },
    [items],
  );

  const handleRestore = useCallback(
    async (item: TrashRoot) => {
      const itemTitle = item.title || t("Untitled");
      setBusyId(item.id);
      try {
        await requestTrashAction("restore", item.id);
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        await refreshTree();
        setStatusMessage(`${t("Restore")}: ${itemTitle}`);
        toast.success(`${t("Restore")}: ${itemTitle}`);
        notifyTrashChanged();
        focusAfterRemoval(item.id);
      } catch (restoreError) {
        console.error("Failed to restore trash item:", restoreError);
        toast.error(t("Could not complete that action. Please try again."));
      } finally {
        setBusyId(null);
      }
    },
    [focusAfterRemoval, refreshTree, t],
  );

  const confirmPendingAction = useCallback(async () => {
    if (!pendingAction) return;

    if (pendingAction.kind === "empty") {
      setBusyId("empty");
      try {
        await requestTrashAction("empty");
        setItems([]);
        setStatusMessage(t("Empty Trash"));
        toast.success(t("Empty Trash"));
        notifyTrashChanged();
        window.requestAnimationFrame(() => headingRef.current?.focus());
      } catch (emptyError) {
        console.error("Failed to empty trash:", emptyError);
        toast.error(t("Could not complete that action. Please try again."));
      } finally {
        setBusyId(null);
        setPendingAction(null);
      }
      return;
    }

    const { item } = pendingAction;
    const itemTitle = item.title || t("Untitled");
    setBusyId(item.id);
    try {
      await requestTrashAction("delete", item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setStatusMessage(`${t("Delete permanently")}: ${itemTitle}`);
      toast.success(`${t("Delete permanently")}: ${itemTitle}`);
      notifyTrashChanged();
      focusAfterRemoval(item.id);
    } catch (deleteError) {
      console.error("Failed to permanently delete trash item:", deleteError);
      toast.error(t("Could not complete that action. Please try again."));
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  }, [focusAfterRemoval, pendingAction, t]);

  const isMutating = busyId !== null;
  const pendingItem = pendingAction?.kind === "delete" ? pendingAction.item : null;
  const pendingItemTitle = pendingItem?.title || t("Untitled");

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-labelledby="trash-heading">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>

      <header className="shrink-0 border-b border-border-subtle">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-md border border-border-subtle bg-surface text-text-tertiary">
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h1
                ref={headingRef}
                id="trash-heading"
                tabIndex={-1}
                className="text-lg font-semibold tracking-tight text-text outline-none"
              >
                {t("Trash")}
              </h1>
              {!loading && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-radius-sm bg-subtle px-1.5 py-0.5 text-xs font-semibold tabular-nums text-text-tertiary"
                  aria-label={t("Contains {count} items", { count: items.length })}
                >
                  {items.length}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-text-tertiary">
              {t("Items in Trash are permanently deleted after 30 days.")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPendingAction({ kind: "empty" })}
            disabled={loading || error || items.length === 0 || isMutating}
            title={items.length === 0 ? t("Trash is empty") : undefined}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-radius-md px-2.5 text-sm font-medium text-error-400/90 transition-colors hover:bg-error-500/10 hover:text-error-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500/50 disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent"
          >
            {busyId === "empty" ? t("Loading...") : t("Empty Trash")}
          </button>
        </div>
      </header>

      <div className="obsidian-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-text-tertiary" role="status">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("Loading...")}
          </div>
        ) : error ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-radius-lg bg-subtle text-text-tertiary/70">
              <TrashIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-text-secondary">
              {t("Could not load Trash. Please try again.")}
            </h2>
            <button
              type="button"
              onClick={() => void loadItems()}
              className="mt-4 inline-flex min-h-11 items-center rounded-radius-md bg-subtle px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            >
              {t("Try again")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-radius-lg border border-border-subtle bg-surface text-text-tertiary/60">
              <TrashIcon className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-text">
              {t("Trash is empty")}
            </h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-text-tertiary">
              {t("Deleted notes and folders will appear here for 30 days.")}
            </p>
            <Link
              href="/notes"
              className="mt-5 inline-flex min-h-11 items-center rounded-radius-md bg-primary-500/15 px-3 text-sm font-medium text-primary-300 transition-colors hover:bg-primary-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            >
              {t("Notes")}
            </Link>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-3xl flex-col gap-2" aria-label={t("Trash")}>
            {items.map((item) => {
              const isBusy = busyId === item.id;
              const itemTitle = item.title || t("Untitled");
              const path = item.originalPath.filter(Boolean).join(" / ");
              const days = daysUntil(item.purgeAt);
              const expiryLabel =
                days === 0
                  ? t("Expires today")
                  : days === 1
                    ? t("Expires tomorrow")
                    : t("Permanently deleted in {days} days", { days });

              return (
                <li
                  key={item.id}
                  className={`group flex flex-col gap-4 rounded-radius-lg border border-border-subtle bg-surface/60 p-3 shadow-sm transition-[border-color,background-color,opacity,transform] duration-150 motion-reduce:transition-none sm:flex-row sm:items-center sm:p-4 ${
                    isBusy
                      ? "pointer-events-none translate-y-0.5 opacity-60"
                      : "hover:border-primary-500/25 hover:bg-surface"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-subtle text-text-tertiary">
                      {item.isFolder ? (
                        <FolderIcon className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <DocumentIcon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <h2 className="truncate text-sm font-semibold text-text" title={itemTitle}>
                        {itemTitle}
                      </h2>
                      {path && (
                        <p className="mt-1 truncate text-xs text-text-tertiary" title={path}>
                          {path}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
                        <time dateTime={item.deletedAt}>{formatDate(item.deletedAt, activeLocale)}</time>
                        {item.isFolder && item.descendantCount > 0 && (
                          <span className="before:mr-2 before:text-border before:content-['•']">
                            {t("Contains {count} items", {
                              count: item.descendantCount,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 sm:ml-auto sm:flex-nowrap sm:justify-end">
                    <span
                      className={`inline-flex min-h-7 items-center rounded-full border px-2 text-xs font-medium tabular-nums ${expiryTone(days)}`}
                    >
                      {expiryLabel}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        ref={(element) => {
                          if (element) {
                            restoreButtonRefs.current.set(item.id, element);
                          } else {
                            restoreButtonRefs.current.delete(item.id);
                          }
                        }}
                        type="button"
                        onClick={() => void handleRestore(item)}
                        disabled={isMutating}
                        aria-label={`${t("Restore")}: ${itemTitle}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-radius-md bg-primary-500 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-50"
                      >
                        {isBusy ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />
                        )}
                        {t("Restore")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ kind: "delete", item })}
                        disabled={isMutating}
                        aria-label={`${t("Delete permanently")}: ${itemTitle}`}
                        title={`${t("Delete permanently")}: ${itemTitle}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-error-500/10 hover:text-error-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500/50 disabled:cursor-wait disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={pendingAction !== null}
        onClose={() => {
          if (!isMutating) setPendingAction(null);
        }}
        role="alertdialog"
        initialFocus={cancelButtonRef}
        className="relative z-[10000]"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/55 backdrop-blur-[2px]" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-radius-lg border border-border-subtle bg-surface p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-error-500/10 text-error-400">
                <TrashIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-text">
                  {pendingAction?.kind === "empty" ? t("Empty Trash?") : t("Delete permanently?")}
                </DialogTitle>
                {pendingItem && (
                  <p className="mt-1 truncate text-sm font-medium text-text-secondary" title={pendingItemTitle}>
                    {pendingItemTitle}
                  </p>
                )}
              </div>
            </div>

            <Description as="div" className="mt-4 space-y-2 text-sm leading-6 text-text-secondary">
              {pendingAction?.kind === "empty" ? (
                <>
                  <p className="font-medium text-text-secondary">
                    {t("Contains {count} items", { count: items.length })}
                  </p>
                  <p>{t("All items in Trash will be permanently deleted. This cannot be undone.")}</p>
                </>
              ) : (
                <>
                  {pendingItem?.isFolder && pendingItem.descendantCount > 0 && (
                    <p className="font-medium text-text-secondary">
                      {t("Contains {count} items", {
                        count: pendingItem.descendantCount,
                      })}
                    </p>
                  )}
                  <p>{t("This item will be permanently deleted. This cannot be undone.")}</p>
                </>
              )}
            </Description>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={isMutating}
                className="min-h-11 rounded-radius-md px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:cursor-wait disabled:opacity-50"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingAction()}
                disabled={isMutating}
                className="min-h-11 rounded-radius-md bg-error-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-error-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-wait disabled:opacity-50"
              >
                {isMutating
                  ? t("Loading...")
                  : pendingAction?.kind === "empty"
                    ? t("Empty Trash")
                    : t("Delete permanently")}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </section>
  );
}
