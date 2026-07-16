"use client";

import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import { formatDateKey, parseDateKey } from "@/lib/notes/utils/calendar-date";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface StudyBlockDialogProps {
  open: boolean;
  onClose: () => void;
  initialDate: string;
  initialStart?: string;
  initialEnd?: string;
}

function defaultTimeRange(dateKey: string) {
  const now = new Date();
  if (formatDateKey(now) !== dateKey) {
    return { start: "09:00", end: "09:30" };
  }

  const rounded = new Date(now);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 30) * 30);
  const end = new Date(rounded.getTime() + 30 * 60_000);
  const time = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return { start: time(rounded), end: time(end) };
}

function localDateTime(dateKey: string, time: string): Date | null {
  const date = parseDateKey(dateKey);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!date || !match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour > 23 || minute > 59) return null;
  return new Date(date.year, date.month - 1, date.day, hour, minute, 0, 0);
}

export default function StudyBlockDialog({
  open,
  onClose,
  initialDate,
  initialStart,
  initialEnd,
}: StudyBlockDialogProps) {
  const { t } = useI18n();
  const createTimeBlock = useCalendarStore((state) => state.createTimeBlock);
  const timeBlocks = useCalendarStore((state) => state.timeBlocks);
  const formId = useId();
  const titleId = `${formId}-title`;
  const dateId = `${formId}-date`;
  const startId = `${formId}-start`;
  const endId = `${formId}-end`;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaults = defaultTimeRange(initialDate);
    setTitle("");
    setDate(initialDate);
    setStart(initialStart ?? defaults.start);
    setEnd(initialEnd ?? defaults.end);
    setError(null);
  }, [initialDate, initialEnd, initialStart, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const startsAt = localDateTime(date, start);
    const endsAt = localDateTime(date, end);
    if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
      setError(t("End time must be after start time"));
      return;
    }

    const overlaps = timeBlocks.some(
      (block) =>
        new Date(block.starts_at).getTime() < endsAt.getTime() &&
        new Date(block.ends_at).getTime() > startsAt.getTime(),
    );
    if (overlaps) {
      setError(t("This time overlaps another study block"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createTimeBlock({
        title: title.trim() || undefined,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      });
      if (!created) {
        setError(t("Something went wrong"));
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClassName =
    "min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-2 text-sm text-text-secondary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50";

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel className="flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-radius-lg border border-border-subtle bg-surface shadow-xl sm:max-w-sm sm:rounded-radius-lg">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <DialogTitle className="text-sm font-medium text-text-secondary">
              {t("Add study block")}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-radius-md text-text-tertiary hover:bg-subtle hover:text-text-secondary"
              aria-label={t("Close")}
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="obsidian-scrollbar min-h-0 space-y-3 overflow-y-auto p-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div>
              <label
                htmlFor={titleId}
                className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
              >
                {t("Title")}
              </label>
              <input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClassName}
                placeholder={t("Study block")}
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor={dateId}
                className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
              >
                {t("Date")}
              </label>
              <input
                id={dateId}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={startId}
                  className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
                >
                  {t("Start")}
                </label>
                <input
                  id={startId}
                  type="time"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor={endId}
                  className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
                >
                  {t("End")}
                </label>
                <input
                  id={endId}
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-radius-md border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full rounded-radius-md bg-primary-600 px-4 text-sm font-medium text-text-on-primary hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? t("Creating...") : t("Add study block")}
            </button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
