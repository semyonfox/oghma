"use client";

import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  courses: string[];
}

export default function NewTaskModal({
  open,
  onClose,
  courses,
}: NewTaskModalProps) {
  const { t } = useI18n();
  const createAssignment = useAssignmentStore((s) => s.createAssignment);
  const formId = useId();
  const titleId = `${formId}-title`;
  const courseId = `${formId}-course`;
  const dueDateId = `${formId}-due-date`;
  const estimatedHoursId = `${formId}-estimated-hours`;
  const descriptionId = `${formId}-description`;
  const courseListId = `${formId}-course-suggestions`;
  const [title, setTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const created = await createAssignment({
        title: title.trim(),
        course_name: courseName || null,
        due_at: dueAt || null,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
        description: description || null,
      });
      if (!created) {
        setError(t("Something went wrong"));
        return;
      }

      setTitle("");
      setCourseName("");
      setDueAt("");
      setEstimatedHours("");
      setDescription("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClassName =
    "min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-2 text-sm text-text-secondary placeholder:text-text-tertiary focus:border-primary-500/50 focus:outline-none focus:ring-1 focus:ring-primary-500/50";

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          data-testid="new-task-panel"
          className="flex max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-radius-lg border border-border-subtle bg-surface shadow-xl sm:max-w-sm sm:rounded-radius-lg"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <DialogTitle className="text-sm font-medium text-text-secondary">
              {t("New Task")}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary"
              aria-label={t("Close")}
            >
              <XMarkIcon className="h-5 w-5" />
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
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClassName}
                placeholder={t("Assignment name...")}
                autoFocus
                required
              />
            </div>

            <div>
              <label
                htmlFor={courseId}
                className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
              >
                {t("Course")}
              </label>
              <input
                id={courseId}
                type="text"
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                list={courseListId}
                className={inputClassName}
                placeholder={t("Course name...")}
              />
              <datalist id={courseListId}>
                {courses.map((course) => (
                  <option key={course} value={course} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label
                  htmlFor={dueDateId}
                  className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
                >
                  {t("Due Date")}
                </label>
                <input
                  id={dueDateId}
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  className={`${inputClassName} [color-scheme:dark]`}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={estimatedHoursId}
                  className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
                >
                  {t("Est. Hours")}
                </label>
                <input
                  id={estimatedHoursId}
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(event) => setEstimatedHours(event.target.value)}
                  className={inputClassName}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={descriptionId}
                className="mb-1 block text-xs uppercase tracking-wider text-text-tertiary"
              >
                {t("Description")}
              </label>
              <textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className={`${inputClassName} resize-none`}
                placeholder={t("Optional notes...")}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-radius-md border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-300"
              >
                {error}. {t("Try again")}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="min-h-11 w-full rounded-radius-md bg-primary-600 py-2 text-sm font-medium text-text-on-primary transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? t("Creating...") : t("Create Task")}
            </button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
