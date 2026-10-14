"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { messageFor, requestJson } from "@/components/study-map/study-client";
import {
  examPaperImportSchema,
  MAX_EXAM_IMPORT_BYTES,
  type ExamPaperImport,
  type ExamPaperImportResult,
} from "@/lib/study-map/paper-import-format";

interface ExamPaperImportControlProps {
  mapId: string;
  moduleName: string;
  onImported: () => Promise<void>;
}

const MAX_FILES = 20;

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md border border-border-subtle px-3 py-2 text-sm font-medium text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const resultSchema: z.ZodType<ExamPaperImportResult> = z.object({
  noteId: z.uuid(),
  textNoteId: z.uuid(),
  duplicate: z.boolean(),
  indexing: z.enum(["queued", "retry-needed"]),
});

type Outcome =
  | { kind: "imported" | "duplicate" | "indexing-retry" }
  | { kind: "error"; message: string };

interface Entry {
  key: number;
  file: File;
  paper: Pick<
    ExamPaperImport,
    "moduleCode" | "academicYear" | "sitting"
  > | null;
  invalid: string | null;
  outcome: Outcome | null;
}

function isCommitted(outcome: Outcome | null): boolean {
  return outcome !== null && outcome.kind !== "error";
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// the file is read locally to show what will be imported, nothing is sent until Import
async function readPaper(
  file: File,
): Promise<{ paper: ExamPaperImport; text: string } | { error: string }> {
  if (file.size > MAX_EXAM_IMPORT_BYTES) {
    return {
      error: `This file is larger than ${Math.round(MAX_EXAM_IMPORT_BYTES / (1024 * 1024))} MB.`,
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: "This file could not be read. Choose it again." };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "This is not an exam paper file." };
  }
  const parsed = examPaperImportSchema.safeParse(data);
  return parsed.success
    ? { paper: parsed.data, text }
    : {
        error:
          "This exam paper file is incomplete or damaged. Export it again and retry.",
      };
}

function outcomeText(outcome: Outcome): string {
  switch (outcome.kind) {
    case "imported":
      return "Imported";
    case "duplicate":
      return "Already imported";
    case "indexing-retry":
      return "Imported. The searchable text is not ready yet and will need another try.";
    case "error":
      return outcome.message;
  }
}

export default function ExamPaperImportControl({
  mapId,
  moduleName,
  onImported,
}: ExamPaperImportControlProps) {
  const id = useId();
  const nextKey = useRef(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const pending = entries.filter(
    (entry) =>
      entry.paper !== null &&
      (!isCommitted(entry.outcome) || entry.outcome?.kind === "indexing-retry"),
  );
  const hasFailures = pending.some(
    (entry) =>
      entry.outcome?.kind === "error" ||
      entry.outcome?.kind === "indexing-retry",
  );
  const busy = reading || running;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // reset so choosing the same file again still fires a change
    event.target.value = "";
    setSelectionError(null);
    setRefreshError(null);
    setProgress("");
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      setSelectionError(
        `Choose up to ${MAX_FILES} files at a time. You chose ${files.length}.`,
      );
      return;
    }
    setReading(true);
    const read: Entry[] = [];
    for (const file of files) {
      const result = await readPaper(file);
      read.push({
        key: nextKey.current++,
        file,
        paper:
          "paper" in result
            ? {
                moduleCode: result.paper.moduleCode,
                academicYear: result.paper.academicYear,
                sitting: result.paper.sitting,
              }
            : null,
        invalid: "error" in result ? result.error : null,
        outcome: null,
      });
    }
    // earlier successes stay visible, everything else is replaced by the new choice
    setEntries((current) => [
      ...current.filter((entry) => isCommitted(entry.outcome)),
      ...read,
    ]);
    setReading(false);
  }

  function settle(key: number, outcome: Outcome) {
    setEntries((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, outcome } : entry,
      ),
    );
  }

  async function importOne(entry: Entry): Promise<Outcome> {
    // re-read at submit so the request carries exactly what was validated, without holding every file in memory
    const read = await readPaper(entry.file);
    if ("error" in read) return { kind: "error", message: read.error };
    try {
      const data = await requestJson(
        `/api/study-maps/${encodeURIComponent(mapId)}/papers/import`,
        { method: "POST", body: read.text },
      );
      const result = resultSchema.safeParse(data);
      if (!result.success) {
        return {
          kind: "error",
          message:
            "The import finished with an unexpected response. Refresh to check whether the paper was added.",
        };
      }
      return result.data.indexing === "retry-needed"
        ? { kind: "indexing-retry" }
        : { kind: result.data.duplicate ? "duplicate" : "imported" };
    } catch (cause) {
      return { kind: "error", message: messageFor(cause) };
    }
  }

  async function run() {
    const queue = pending;
    if (queue.length === 0) return;
    setRunning(true);
    setSelectionError(null);
    setRefreshError(null);
    let committed = 0;
    let failed = 0;
    for (const [index, entry] of queue.entries()) {
      setProgress(`Importing ${index + 1} of ${queue.length}…`);
      const outcome = await importOne(entry);
      if (isCommitted(outcome)) committed += 1;
      else failed += 1;
      settle(entry.key, outcome);
    }
    setProgress(
      failed === 0
        ? `${committed} ${committed === 1 ? "paper" : "papers"} added to ${moduleName}.`
        : `${committed} added, ${failed} failed. Retry the failed ${failed === 1 ? "paper" : "papers"} when you are ready.`,
    );
    if (committed > 0) {
      try {
        await onImported();
      } catch (cause) {
        setRefreshError(
          `The papers were imported, but the list could not be refreshed. ${messageFor(cause)}`,
        );
      }
    }
    setRunning(false);
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="space-y-4 rounded-radius-lg border border-border-subtle p-4 sm:p-5"
    >
      <div className="max-w-2xl space-y-1">
        <h3 id={`${id}-heading`} className="text-base font-semibold text-text">
          Add past exam papers
        </h3>
        <p className="text-sm leading-relaxed text-text-secondary">
          Each file adds the original PDF and its searchable text to{" "}
          <span className="font-medium text-text">{moduleName}</span>. Imported
          papers appear below for review before they count towards coverage.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`${id}-files`}
          className={`${buttonClass} ${busy ? "pointer-events-none opacity-50" : "cursor-pointer"} focus-within:ring-2 focus-within:ring-primary-500`}
        >
          {reading ? "Checking files…" : "Choose exam files"}
          <input
            id={`${id}-files`}
            type="file"
            accept=".oghma-exam.json"
            multiple
            className="sr-only"
            disabled={busy}
            aria-describedby={`${id}-hint`}
            onChange={(event) => void choose(event)}
          />
        </label>
        <button
          type="button"
          className={primaryClass}
          disabled={busy || pending.length === 0}
          onClick={() => void run()}
        >
          {running
            ? "Importing…"
            : hasFailures
              ? `Retry ${pending.length} ${pending.length === 1 ? "paper" : "papers"}`
              : pending.length > 0
                ? `Import ${pending.length} ${pending.length === 1 ? "paper" : "papers"}`
                : "Import"}
        </button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-text-tertiary">
        Up to {MAX_FILES} exam paper files at a time. Nothing is uploaded until
        you choose Import.
      </p>

      {entries.length > 0 && (
        <ul className="space-y-2" aria-label="Selected exam papers">
          {entries.map((entry) => {
            const failed =
              entry.invalid !== null || entry.outcome?.kind === "error";
            return (
              <li
                key={entry.key}
                className="flex flex-col gap-1 rounded-radius-md bg-surface p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="break-all text-sm font-medium text-text">
                    {entry.file.name}
                  </p>
                  {entry.paper ? (
                    <p className="text-sm text-text-secondary">
                      <span className="tabular-nums">
                        {entry.paper.moduleCode} · {entry.paper.academicYear} ·
                        Sitting {entry.paper.sitting}
                      </span>{" "}
                      → {moduleName}
                    </p>
                  ) : (
                    <p className="text-sm text-text-tertiary">
                      {sizeLabel(entry.file.size)}
                    </p>
                  )}
                </div>
                <p
                  className={`text-sm sm:max-w-xs sm:text-right ${failed ? "text-error-600" : "text-text-secondary"}`}
                >
                  {entry.invalid ??
                    (entry.outcome
                      ? outcomeText(entry.outcome)
                      : "Ready to import")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-text-secondary"
      >
        {progress}
      </p>
      {selectionError && (
        <p role="alert" className="text-sm text-error-600">
          {selectionError}
        </p>
      )}
      {refreshError && (
        <p role="alert" className="text-sm text-error-600">
          {refreshError}
        </p>
      )}
    </section>
  );
}
