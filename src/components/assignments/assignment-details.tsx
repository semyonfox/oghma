"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import DOMPurify from "dompurify";
import { z } from "zod";
import { type Assignment } from "@/lib/notes/state/assignments.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";

const detailsSchema = z.object({
  url: z.url().refine(value => value.startsWith("https://")),
  description: z.string().nullable(), types: z.array(z.string()),
  locked: z.boolean(), submittedAt: z.string().nullable(),
});

function renderInstructions(html: string, canvasUrl?: string) {
  if (typeof window === "undefined") return "";
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button"],
  });
  const document = new DOMParser().parseFromString(clean, "text/html");
  for (const link of document.querySelectorAll("a[href]")) {
    try {
      const url = new URL(link.getAttribute("href") ?? "", canvasUrl);
      if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error();
      link.setAttribute("href", url.href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    } catch {
      link.removeAttribute("href");
    }
  }
  for (const image of document.querySelectorAll("img[src]")) {
    try {
      const url = new URL(image.getAttribute("src") ?? "", canvasUrl);
      if (url.protocol !== "https:") throw new Error();
      image.setAttribute("src", url.href);
      image.removeAttribute("srcset");
    } catch {
      image.remove();
    }
  }
  return document.body.innerHTML;
}

export default function AssignmentDetails({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const { t } = useI18n();
  const [details, setDetails] = useState<z.infer<typeof detailsSchema> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(assignment.source === "canvas");
  const [attempt, setAttempt] = useState(0);
  const [type, setType] = useState("online_text_entry");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [review, setReview] = useState(false);

  useEffect(() => {
    if (assignment.source !== "canvas") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/assignments/${assignment.id}/canvas`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = detailsSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setDetails(result);
        setType(result.types.includes("online_text_entry") ? "online_text_entry" : "online_url");
      } catch {
        if (!controller.signal.aborted) setError("Could not load Canvas details. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [assignment.id, assignment.source, attempt]);

  const description = details?.description ?? assignment.description;
  const canSubmit = details && !details.locked && details.types.some(value => value === "online_text_entry" || value === "online_url");
  const inputClass = "w-full rounded-radius-md border border-border-subtle bg-surface p-3 text-sm text-text-secondary";

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/assignments/${assignment.id}/canvas`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content }),
      });
      if (!response.ok) throw new Error();
      setSubmitted(true);
      setReview(false);
    } catch {
      setError("Submission could not be confirmed. Check Canvas before trying again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} className="relative z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel className="max-h-[90dvh] w-full overflow-y-auto rounded-t-radius-lg border border-border-subtle bg-surface shadow-xl sm:max-w-2xl sm:rounded-radius-lg">
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
            <div>
              <p className="text-xs text-text-tertiary">{assignment.course_name ?? t("Tasks")}</p>
              <DialogTitle className="mt-1 text-lg font-medium text-text-primary">{assignment.title}</DialogTitle>
              <p className="mt-2 text-sm text-text-secondary">{assignment.due_at ? new Date(assignment.due_at).toLocaleString() : t("No due date")}</p>
            </div>
            <button disabled={saving} onClick={onClose} className="min-h-11 px-2 text-sm text-text-secondary">{t("Close")}</button>
          </div>
          <div className="space-y-5 p-5">
            {description ? assignment.source === "canvas" ? (
              <div className="prose prose-sm max-w-none text-text-secondary [&_a]:text-primary-400 [&_a]:underline" dangerouslySetInnerHTML={{ __html: renderInstructions(description, details?.url) }} />
            ) : <p className="whitespace-pre-wrap text-sm text-text-secondary">{description}</p> : <p className="text-sm text-text-tertiary">{t("No description")}</p>}
            {loading && <p role="status" className="text-sm text-text-tertiary">{t("Loading...")}</p>}
            {details && <a href={details.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-radius-md border border-border-subtle px-4 text-sm text-primary-400">{t("Open in Canvas")} ↗</a>}
            {details?.locked && <p className="text-sm text-text-secondary">{t("This assignment is locked in Canvas.")}</p>}
            {(details?.submittedAt || assignment.submitted_at) && <p className="text-sm text-text-secondary">{t("Previously submitted")} · {new Date(details?.submittedAt ?? assignment.submitted_at!).toLocaleString()}</p>}
            {submitted ? <p role="status" className="text-sm text-primary-400">{t("Submitted to Canvas. Open Canvas to view your submission.")}</p> : canSubmit ? (
              <form className="space-y-3 border-t border-border-subtle pt-5" onSubmit={event => { event.preventDefault(); setReview(true); }}>
                <h3 className="font-medium text-text-primary">{t("Submit to Canvas")}</h3>
                <label className="block text-sm text-text-secondary">{t("Submission type")}
                  <select value={type} disabled={saving || review} onChange={event => setType(event.target.value)} className={`${inputClass} mt-1`}>
                    {details.types.includes("online_text_entry") && <option value="online_text_entry">{t("Text entry")}</option>}
                    {details.types.includes("online_url") && <option value="online_url">{t("Website URL")}</option>}
                  </select>
                </label>
                <label className="block text-sm text-text-secondary">{type === "online_url" ? t("Website URL") : t("Your submission")}
                  {type === "online_url" ? <input type="url" required pattern="https?://.*" maxLength={4000} value={content} disabled={saving || review} onChange={event => setContent(event.target.value)} className={`${inputClass} mt-1`} /> : <textarea required rows={7} maxLength={100000} value={content} disabled={saving || review} onChange={event => setContent(event.target.value)} className={`${inputClass} mt-1`} />}
                </label>
                {review ? <div className="space-y-3">
                  <p className="text-sm text-text-secondary">{t("This sends your work to your lecturer in Canvas. Check the content above before submitting.")}</p>
                  <button type="button" disabled={saving} onClick={() => void submit()} className="min-h-11 rounded-radius-md bg-primary-600 px-4 text-sm text-text-on-primary">{saving ? t("Submitting...") : t("Confirm submission")}</button>
                  <button type="button" disabled={saving} onClick={() => setReview(false)} className="min-h-11 px-4 text-sm text-text-secondary">{t("Back to editing")}</button>
                </div> : <button type="submit" disabled={!content.trim()} className="min-h-11 rounded-radius-md bg-primary-600 px-4 text-sm text-text-on-primary disabled:opacity-50">{t("Review submission")}</button>}
              </form>
            ) : details && !details.locked && <p className="text-sm text-text-secondary">{t("Complete this assignment in Canvas. File uploads, quizzes and external tools open there.")}</p>}
            {error && <div role="alert" className="text-sm text-error-300"><p>{t(error)}</p>{!details && !loading && <button onClick={() => setAttempt(value => value + 1)} className="min-h-11 underline">{t("Try again")}</button>}</div>}
            <p className="text-xs text-text-tertiary">{t("Marking a task done only updates your tracker. It does not submit work to Canvas.")}</p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
