"use client";

import { useEffect, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { browserTimeZone } from "@/lib/quiz/time-zone";
import type { QuizDashboardCourse } from "@/lib/quiz/types";
import type { loadExamPlans } from "@/lib/quiz/exams";

type Exam = Awaited<ReturnType<typeof loadExamPlans>>[number];
const field =
  "min-w-0 w-full min-h-11 rounded-radius-md border border-border bg-surface px-3 text-base text-text";

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
      className="mb-6 rounded-radius-xl border border-border bg-surface p-4"
      aria-label={t("exam.title")}
    >
      <h2 className="font-serif text-xl text-text">{t("exam.title")}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t("exam.read_only")}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-text">
          {t("exam.error")}
        </p>
      )}
      <div className="divide-y divide-border-subtle">
        {exams.map((exam) => (
          <div
            key={exam.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
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
            <div className="flex gap-3 text-sm text-text">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => onReview(exam.id)}
              >
                {t("exam.review")}
              </button>
              <button type="button" disabled={busy} onClick={() => edit(exam)}>
                {t("exam.edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(exam.id)}
              >
                {t("exam.remove")}
              </button>
            </div>
          </div>
        ))}
      </div>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
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
        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
          {t("exam.name")}
          <input
            className={field}
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
          {t("exam.date")}
          <input
            className={field}
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
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
        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
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
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="text-sm text-text-secondary">
            {t("exam.notes")}
          </legend>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={notes !== null}
              onChange={(e) => setNotes(e.target.checked ? [] : null)}
            />
            {t("exam.limit_notes")}
          </label>
          {notes !== null && (
            <>
              <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
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
                  <label key={note.id} className="flex gap-2 text-sm text-text">
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
        <p className="text-xs text-text-secondary sm:col-span-2">
          {t("exam.scope_hint")}
        </p>
        <button
          className="min-h-11 rounded-radius-lg bg-action px-4 text-sm font-semibold text-on-action disabled:opacity-50"
          disabled={busy}
        >
          {t(editing ? "exam.save" : "exam.add")}
        </button>
        {editing && (
          <button type="button" className="text-sm text-text" onClick={reset}>
            {t("exam.cancel")}
          </button>
        )}
      </form>
    </section>
  );
}
