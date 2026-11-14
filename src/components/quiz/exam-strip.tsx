"use client";

import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { browserTimeZone } from "@/lib/quiz/time-zone";
import type { QuizDashboardCourse } from "@/lib/quiz/types";
import type { loadExamPlans } from "@/lib/quiz/exams";

type Exam = Awaited<ReturnType<typeof loadExamPlans>>[number];
// text-base on phones stops iOS zooming into focused inputs
const field =
  "min-w-0 w-full min-h-11 rounded-radius-md border border-border bg-background px-2.5 text-base text-text sm:min-h-9 sm:text-sm";
const label = "grid min-w-0 gap-1 text-xs font-medium text-text-secondary";
const rowAction =
  "rounded-radius-md px-2 py-1 text-text-secondary transition-colors hover:bg-subtle hover:text-text disabled:opacity-50";

export default function ExamStrip({
  courses,
  onReview,
  disabled,
}: {
  courses: QuizDashboardCourse[];
  onReview: (id: string) => void;
  disabled: boolean;
}) {
  const { t, activeLocale } = useI18n();
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [course, setCourse] = useState("");
  const [map, setMap] = useState("");
  const [notes, setNotes] = useState<string[] | null>(null);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteOptions, setNoteOptions] = useState<
    { id: string; title: string }[]
  >([]);
  const [maps, setMaps] = useState<{ id: string; name: string }[]>([]);

  async function reload() {
    const res = await fetch(
      `/api/quiz/exams?tz=${encodeURIComponent(browserTimeZone())}`,
    );
    if (!res.ok) throw new Error("load failed");
    setExams(await res.json());
  }
  useEffect(() => {
    void reload().catch(() => setError(true));
    void fetch("/api/study-maps")
      .then(async (res) => {
        if (res.ok) setMaps(await res.json());
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(
        `/api/notes?fields=id,title&limit=50&q=${encodeURIComponent(noteQuery)}`,
        { signal: controller.signal },
      )
        .then(async (res) => {
          if (res.ok) setNoteOptions(await res.json());
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [noteQuery]);
  function edit(exam: Exam) {
    setEditing(exam);
    setFormOpen(true);
    setName(exam.name);
    setCourse(exam.canvas_course_id ?? "");
    setMap(exam.study_map_id ?? "");
    setNotes(exam.note_ids);
    const local = new Date(exam.exam_at);
    setDate(
      new Date(local.getTime() - local.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  }
  function reset() {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setDate("");
    setCourse("");
    setMap("");
    setNotes(null);
  }
  async function remove(id: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/quiz/exams/${id}`, { method: "DELETE" });
      if (!res.ok) setError(true);
      else {
        if (editing?.id === id) reset();
        await reload();
      }
    } catch {
      setError(true);
    }
    setBusy(false);
  }
  return (
    <section
      className="mb-6 rounded-radius-xl border border-border bg-surface px-4 py-3"
      aria-label={t("exam.title")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-text">{t("exam.title")}</h2>
          <p className="text-xs text-text-tertiary">{t("exam.read_only")}</p>
        </div>
        {!formOpen && (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-radius-md border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-subtle sm:min-h-8"
            onClick={() => setFormOpen(true)}
          >
            {t("exam.add")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-text">
          {t("exam.error")}
        </p>
      )}
      <div className="mt-2 divide-y divide-border-subtle empty:hidden">
        {exams.map((exam) => (
          <div
            key={exam.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div>
              <p className="font-medium text-text">
                {exam.name}{" "}
                <time
                  className="text-sm text-text-secondary"
                  dateTime={exam.exam_at}
                >
                  {new Date(exam.exam_at).toLocaleDateString(activeLocale)}
                </time>
              </p>
              <p className="text-sm text-text-secondary">
                {t("exam.summary", {
                  count: exam.plan.total,
                  days: exam.daysLeft,
                })}
              </p>
              <p className="text-xs text-text-secondary">
                {t(exam.weighted ? "exam.weighted" : "exam.unweighted")}
              </p>
              {exam.plan.impossible && (
                <p className="mt-1 text-sm text-text">{t("exam.impossible")}</p>
              )}
            </div>
            <div className="flex gap-1 text-sm">
              <button
                type="button"
                className={rowAction}
                disabled={disabled || busy}
                onClick={() => onReview(exam.id)}
              >
                {t("exam.review")}
              </button>
              <button
                type="button"
                className={rowAction}
                disabled={busy}
                onClick={() => edit(exam)}
              >
                {t("exam.edit")}
              </button>
              <button
                type="button"
                className={rowAction}
                disabled={busy}
                onClick={() => void remove(exam.id)}
              >
                {t("exam.remove")}
              </button>
            </div>
          </div>
        ))}
      </div>
      {formOpen && (
        <form
          className="mt-3 grid gap-3 border-t border-border-subtle pt-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(false);
            try {
              const res = await fetch(
                editing ? `/api/quiz/exams/${editing.id}` : "/api/quiz/exams",
                {
                  method: editing ? "PUT" : "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    exam_at: new Date(date).toISOString(),
                    canvas_course_id: course || null,
                    study_map_id: map || null,
                    note_ids: notes,
                  }),
                },
              );
              if (!res.ok) setError(true);
              else {
                reset();
                await reload();
              }
            } catch {
              setError(true);
            }
            setBusy(false);
          }}
        >
          <label className={label}>
            {t("exam.name")}
            <input
              className={field}
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={label}>
            {t("exam.date")}
            <input
              className={field}
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={label}>
            {t("exam.course")}
            <select
              className={field}
              value={course}
              onChange={(e) => setCourse(e.target.value)}
            >
              <option value="">{t("exam.all_courses")}</option>
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.courseName}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("exam.map")}
            <select
              className={field}
              value={map}
              onChange={(e) => setMap(e.target.value)}
            >
              <option value="">{t("exam.no_map")}</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2 sm:col-span-2 lg:col-span-4">
            <legend className="sr-only">{t("exam.notes")}</legend>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={notes !== null}
                onChange={(e) => setNotes(e.target.checked ? [] : null)}
              />
              {t("exam.limit_notes")}
            </label>
            {notes !== null && (
              <>
                <label className={label}>
                  {t("exam.search_notes")}
                  <input
                    className={field}
                    value={noteQuery}
                    onChange={(e) => setNoteQuery(e.target.value)}
                  />
                </label>
                <p className="text-xs text-text-secondary">
                  {t("exam.selected", { count: notes.length })}
                </p>
                <div className="max-h-36 overflow-y-auto space-y-2">
                  {noteOptions.map((note) => (
                    <label
                      key={note.id}
                      className="flex gap-2 text-sm text-text"
                    >
                      <input
                        type="checkbox"
                        checked={notes.includes(note.id)}
                        onChange={(e) =>
                          setNotes(
                            e.target.checked
                              ? [...notes, note.id]
                              : notes.filter((id) => id !== note.id),
                          )
                        }
                      />
                      {note.title}
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-text-tertiary">{t("exam.scope_hint")}</p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="min-h-11 rounded-radius-md px-3 text-sm text-text-secondary transition-colors hover:bg-subtle hover:text-text sm:min-h-8"
                onClick={reset}
              >
                {t("exam.cancel")}
              </button>
              <button
                className="min-h-11 rounded-radius-md bg-action px-3 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50 sm:min-h-8"
                disabled={busy}
              >
                {t(editing ? "exam.save" : "exam.add")}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
