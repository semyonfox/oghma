"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import type { CourseSetting } from "@/lib/notes/state/courses.zustand";

export interface CourseVisibilityItem {
  courseId: number;
  courseName: string;
  isActive: boolean;
  contextText?: string | null;
  hasDueItems?: boolean;
}

export interface CourseVisibilityItemSource {
  courseId: number;
  courseName: string;
  isActive?: boolean;
  contextText?: string | null;
  hasDueItems?: boolean;
}

interface CourseVisibilityManagerProps {
  items: CourseVisibilityItem[];
  onToggleCourse: (item: CourseVisibilityItem, nextActive: boolean) => Promise<void>;
  onArchiveAllNoDue?: (items: CourseVisibilityItem[]) => Promise<void>;
  onRestoreAll?: (items: CourseVisibilityItem[]) => Promise<void>;
  inline?: boolean;
}

interface CourseVisibilityDialogProps extends CourseVisibilityManagerProps {
  open: boolean;
  onClose: () => void;
}

function sortItems(items: CourseVisibilityItem[]) {
  return [...items].sort((a, b) =>
    a.courseName.localeCompare(b.courseName, undefined, { sensitivity: "base" }),
  );
}

export function mergeCourseVisibilityItems(
  sources: CourseVisibilityItemSource[],
  settings: CourseSetting[],
): CourseVisibilityItem[] {
  const merged = new Map<number, CourseVisibilityItem>();

  for (const setting of settings) {
    merged.set(setting.canvasCourseId, {
      courseId: setting.canvasCourseId,
      courseName: setting.courseName,
      isActive: setting.isActive,
    });
  }

  for (const source of sources) {
    const existing = merged.get(source.courseId);
    merged.set(source.courseId, {
      courseId: source.courseId,
      courseName: source.courseName,
      isActive: existing?.isActive ?? source.isActive ?? true,
      contextText: source.contextText ?? existing?.contextText ?? null,
      hasDueItems: source.hasDueItems ?? existing?.hasDueItems,
    });
  }

  return sortItems(Array.from(merged.values()));
}

export function groupCourseVisibilityItems(
  items: CourseVisibilityItem[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? items.filter((item) => item.courseName.toLowerCase().includes(normalizedQuery))
    : items;

  return {
    active: sortItems(filtered.filter((item) => item.isActive)),
    archived: sortItems(filtered.filter((item) => !item.isActive)),
  };
}

function CourseVisibilityManager({
  items,
  onToggleCourse,
  onArchiveAllNoDue,
  onRestoreAll,
  inline = false,
}: CourseVisibilityManagerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [busyCourseId, setBusyCourseId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState<false | "archive" | "restore">(false);
  const grouped = useMemo(
    () => groupCourseVisibilityItems(items, query),
    [items, query],
  );

  const archivableNoDue = grouped.active.filter((item) => item.hasDueItems === false);
  const sectionCardClass = inline
    ? "rounded-radius-lg border border-border-subtle bg-surface/60"
    : "rounded-radius-lg border border-border-subtle bg-surface/70";

  const handleToggle = async (item: CourseVisibilityItem, nextActive: boolean) => {
    setBusyCourseId(item.courseId);
    try {
      await onToggleCourse(item, nextActive);
    } catch {
      toast.error(
        nextActive
          ? t("Could not restore this course. Please try again.")
          : t("Could not archive this course. Please try again."),
      );
    } finally {
      setBusyCourseId(null);
    }
  };

  const handleBulk = async (
    mode: "archive" | "restore",
    handler: ((batch: CourseVisibilityItem[]) => Promise<void>) | undefined,
    batch: CourseVisibilityItem[],
  ) => {
    if (!handler || batch.length === 0) return;
    setBulkBusy(mode);
    try {
      await handler(batch);
    } catch {
      toast.error(
        mode === "archive"
          ? t("Could not archive the selected courses. Please try again.")
          : t("Could not restore the selected courses. Please try again."),
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search courses")}
          className="w-full rounded-radius-md border border-border-subtle bg-surface px-9 py-2 text-sm text-text-secondary placeholder:text-text-tertiary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
        />
      </div>

      {(onArchiveAllNoDue || onRestoreAll) && (
        <div className="flex flex-wrap gap-2">
          {onArchiveAllNoDue && archivableNoDue.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulk("archive", onArchiveAllNoDue, archivableNoDue)}
              disabled={bulkBusy !== false}
              className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "archive"
                ? t("Archiving...")
                : t("Archive all with no due items")}
            </button>
          )}
          {onRestoreAll && grouped.archived.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulk("restore", onRestoreAll, grouped.archived)}
              disabled={bulkBusy !== false}
              className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy === "restore"
                ? t("Restoring...")
                : t("Restore all archived")}
            </button>
          )}
        </div>
      )}

      <section className={sectionCardClass}>
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
            {t("Active")}
          </div>
        </div>
        {grouped.active.length === 0 ? (
          <div className="px-4 py-4 text-sm text-text-tertiary">
            {t("No active courses match this search.")}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {grouped.active.map((item) => (
              <div
                key={item.courseId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-secondary">
                    {item.courseName}
                  </div>
                  {item.contextText && (
                    <div className="mt-1 text-xs text-text-tertiary">
                      {item.contextText}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(item, false)}
                  disabled={busyCourseId === item.courseId || bulkBusy !== false}
                  className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyCourseId === item.courseId ? t("Saving...") : t("Active")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={sectionCardClass}>
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
            {t("Archived")}
          </div>
        </div>
        {grouped.archived.length === 0 ? (
          <div className="px-4 py-4 text-sm text-text-tertiary">
            {t("No archived courses match this search.")}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {grouped.archived.map((item) => (
              <div
                key={item.courseId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-secondary">
                    {item.courseName}
                  </div>
                  {item.contextText && (
                    <div className="mt-1 text-xs text-text-tertiary">
                      {item.contextText}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(item, true)}
                  disabled={busyCourseId === item.courseId || bulkBusy !== false}
                  className="shrink-0 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs font-semibold text-text-secondary transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyCourseId === item.courseId ? t("Saving...") : t("Archived")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function CourseVisibilityDialog({
  open,
  onClose,
  ...props
}: CourseVisibilityDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/55" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl rounded-radius-lg border border-border-subtle bg-app-page shadow-2xl">
          <div className="flex items-start justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <DialogTitle className="text-base font-semibold text-text-secondary">
                {t("Manage course visibility")}
              </DialogTitle>
              <p className="mt-1 text-sm text-text-tertiary">
                {t("Hide archived courses by default and bring them back when you need to look back.")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-radius-md p-1 text-text-tertiary transition-colors hover:bg-white/[0.07] hover:text-text-secondary"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
            <CourseVisibilityManager {...props} />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default CourseVisibilityManager;
