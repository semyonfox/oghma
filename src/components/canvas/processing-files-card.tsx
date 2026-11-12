"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import useI18n from "@/lib/notes/hooks/use-i18n";

const statusSchema = z.object({
  pollIntervalMs: z.number().optional(),
  activeJob: z.object({ jobId: z.string() }).nullable().optional(),
  recentLogs: z
    .array(
      z.object({
        filename: z.string().nullable(),
        status: z.string(),
        noteId: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

// canvas_imports moves a file through these, see import-extraction.ts
const STAGE_BY_STATUS: Record<string, number> = {
  pending: 0,
  pending_retry: 0,
  pending_cache: 0,
  processing: 1,
  pending_extract: 2,
  indexing: 3,
  done: 4,
  ready: 4,
};
const FAILED = new Set(["error", "forbidden", "failed", "cancelled"]);

interface Row {
  key: string;
  filename: string;
  stage: number;
  failed: boolean;
}

// the "Processing N files" table from the Atlas states mockup, fed by the
// existing canvas status route. it only shows while an import is running
export default function ProcessingFilesCard() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const load = async () => {
      const parsed = await fetch("/api/canvas/status", { cache: "no-store" })
        .then(async (response) => (response.ok ? statusSchema.safeParse(await response.json()) : null))
        .catch(() => null);
      if (cancelled || !parsed?.success) return;
      const active = Boolean(parsed.data.activeJob);
      const next = active
        ? (parsed.data.recentLogs ?? [])
            .filter((log) => log.filename && (log.status in STAGE_BY_STATUS || FAILED.has(log.status)))
            .slice(0, 8)
            .map((log, index) => ({
              key: `${log.noteId ?? log.filename}-${index}`,
              filename: log.filename ?? "",
              stage: STAGE_BY_STATUS[log.status] ?? 0,
              failed: FAILED.has(log.status),
            }))
        : [];
      setRows(next);
      if (active) timer = setTimeout(load, Math.max(2000, parsed.data.pollIntervalMs ?? 4000));
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const inFlight = rows.filter((row) => !row.failed && row.stage < 4).length;
  if (inFlight === 0) return null;

  const stages = [t("Upload"), t("OCR"), t("Embedding"), t("Ready")];
  const statusLabel = (row: Row) =>
    row.failed
      ? t("Failed")
      : [t("Queued"), t("Uploading"), t("OCR"), t("Embedding"), t("Ready")][row.stage];

  return (
    <section className="w-full max-w-3xl rounded-radius-xl border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle px-5 py-3">
        <h2 className="text-sm font-semibold text-text">
          {t("Processing {count} files", { count: inFlight })}
        </h2>
        <p className="text-xs text-text-secondary">{t("You can keep working while these finish.")}</p>
      </header>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-text-tertiary">
            <th className="w-[34%] px-5 py-2 font-normal">{t("File")}</th>
            {stages.map((stage) => (
              <th key={stage} className="px-1.5 py-2 font-normal">{stage}</th>
            ))}
            <th className="w-[18%] px-5 py-2 text-right font-normal">{t("Status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border-subtle">
              <td className="truncate px-5 py-2.5 text-text">{row.filename}</td>
              {stages.map((stage, index) => (
                <td key={stage} className="px-1.5 py-2.5">
                  <span
                    aria-hidden="true"
                    className={`block h-1.5 rounded-full ${
                      row.failed
                        ? "bg-error-500/40"
                        : index < row.stage
                          ? "bg-accent"
                          : index === row.stage && row.stage < 4
                            ? "animate-pulse bg-accent/50"
                            : "bg-subtle-hover"
                    }`}
                  />
                </td>
              ))}
              <td
                className={`px-5 py-2.5 text-right text-xs ${
                  row.failed ? "text-error-700 dark:text-error-300" : row.stage === 4 ? "text-success-700 dark:text-success-400" : "text-text-secondary"
                }`}
              >
                {statusLabel(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
