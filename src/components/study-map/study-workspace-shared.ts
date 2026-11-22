
import { useEffect, useState } from "react";

import { z } from "zod";

import { messageFor, requestJson } from "./study-client";
import { currentAcademicYear, mapCreateSchema } from "@/lib/study-map/types";

// panels, URL state and form styles shared by the study workspace pieces

export type Selection = { kind: "note" | "topic"; id: string };
export type MapFields = z.infer<typeof mapCreateSchema> & { autoClassify: boolean };
export const panelSchema = z.enum([
  "topics",
  "materials",
  "exams",
  "add",
  "settings",
  "search",
  "create",
]);
export type Panel = z.infer<typeof panelSchema>;
export const panelTitles: Record<Panel, string> = {
  topics: "Topics",
  materials: "Materials",
  exams: "Exam history",
  add: "Add materials",
  settings: "Module settings",
  search: "Search all modules",
  create: "Add module",
};
// these follow you from module to module; the rest belong to one module or none
export const browsingPanels = new Set<Panel>(["topics", "materials", "exams"]);
export const clearedFilters = {
  q: null,
  kind: null,
  label: null,
  topic: null,
  status: null,
  sort: null,
};

export function updateLocation(parameters: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  isFolder: z.boolean(),
});
type LibraryNote = z.infer<typeof noteSchema>;
export const fieldClass =
  "min-h-11 w-full min-w-0 rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 md:text-sm";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass = `${buttonClass} border border-border-subtle bg-surface text-text hover:bg-subtle`;
export const primaryClass = `${buttonClass} bg-action text-on-action hover:bg-action-hover`;
export const dangerClass = `${buttonClass} text-error-700 hover:bg-error-500/10 dark:text-error-300`;
export const errorClass =
  "break-words rounded-radius-md bg-error-500/10 p-3 text-sm text-error-700 dark:text-error-300";

export function defaultFields(): MapFields {
  return {
    name: "",
    academicYear: currentAcademicYear(),
    rootNoteId: null,
    canvasCourseId: null,
    syllabusNoteId: null,
    autoClassify: false,
  };
}

export function useLibrarySearch(query: string, enabled: boolean) {
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        fields: "id,title,isFolder",
        limit: "200",
      });
      if (query.trim()) params.set("q", query.trim());
      requestJson(`/api/notes?${params}`, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted)
            setNotes(noteSchema.array().parse(data));
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setError(messageFor(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, enabled]);
  return { notes, loading, error };
}
