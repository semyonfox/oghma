"use client";

import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
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
  const [title, setTitle] = useState("");
  const [courseName, setCourseName] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    await createAssignment({
      title: title.trim(),
      course_name: courseName || null,
      due_at: dueAt || null,
      estimated_hours: estimatedHours ? Number(estimatedHours) : null,
      description: description || null,
    });
    setSaving(false);

    // reset and close
    setTitle("");
    setCourseName("");
    setDueAt("");
    setEstimatedHours("");
    setDescription("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm glass-card rounded-radius-lg shadow-xl">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <DialogTitle className="text-sm font-medium text-text-secondary">
              {t("New Task")}
            </DialogTitle>
            <button
              onClick={onClose}
              className="rounded p-1 text-text-tertiary hover:text-text-secondary hover:bg-white/[0.07]"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-text-tertiary mb-1">
                {t("Title")}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
                placeholder={t("Assignment name...")}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-text-tertiary mb-1">
                {t("Course")}
              </label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                list="course-suggestions"
                className="w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
                placeholder={t("Course name...")}
              />
              <datalist id="course-suggestions">
                {courses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-text-tertiary mb-1">
                  {t("Due Date")}
                </label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-secondary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-text-tertiary mb-1">
                  {t("Est. Hours")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className="w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-text-tertiary mb-1">
                {t("Description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1.5 text-sm text-text-secondary placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none resize-none"
                placeholder={t("Optional notes...")}
              />
            </div>

            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="w-full rounded-radius-md bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-400 transition-colors disabled:opacity-50"
            >
              {saving ? t("Creating...") : t("Create Task")}
            </button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
