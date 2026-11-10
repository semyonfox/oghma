"use client";

import { type ChangeEvent, useState, useEffect } from "react";
import { toast } from "sonner";
import { CheckIcon, ClipboardDocumentIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { copyText } from "@/lib/clipboard";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  cn,
  errorNoticeClass,
  errorTextClass,
  readResponseError,
  saveBtnClass,
  secondaryBtnClass,
  successNoticeClass,
} from "./settings-utils";
import { SettingsCard, SettingsCardBody } from "./settings-card";
import { usePollingJob } from "@/lib/hooks/use-polling-job";

type ExportStatus = "uploading" | "processing" | "complete" | "failed" | "cancelled";
type Progress = { completed: number; total: number; percent?: number };
type JobData = { job?: { status?: string; error?: string; jobId?: string }; progress?: Progress; downloadUrl?: string };

export default function DataExportSection() {
  const { t } = useI18n();

  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarRegenerating, setCalendarRegenerating] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);

  const [importStatus, setImportStatus] = useState<ExportStatus | null>(null);
  const [importProgress, setImportProgress] = useState<Progress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importCancelRequested, setImportCancelRequested] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<Progress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCancelRequested, setExportCancelRequested] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/token")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.token) setCalendarToken(data.token); })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, []);

  async function handleRegenerateToken() {
    if (!confirm(t("This will invalidate your current subscription URL. Any calendar apps using the old URL will stop syncing. Continue?"))) return;
    setCalendarRegenerating(true);
    const run = async () => {
      const res = await fetch("/api/calendar/token", { method: "POST" });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      setCalendarToken(token);
      toast.success(t("Calendar subscription URL regenerated"));
    };
    await run()
      .catch(() => {
        toast.error(t("Failed to regenerate token"));
      })
      .finally(() => {
        setCalendarRegenerating(false);
      });
  }

  function handleCopyCalendarUrl() {
    const url = `${window.location.origin}/api/calendar/ical/${calendarToken}`;
    setCalendarCopied(true);
    void copyText(url).then((ok) => {
      if (ok) {
        window.setTimeout(() => setCalendarCopied(false), 1500);
        return;
      }
      setCalendarCopied(false);
      toast.error(t("Failed to copy URL"));
    });
  }

  async function handleVaultImport(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error(t("Please select a .zip file"));
      input.value = "";
      return;
    }

    const run = async () => {
      setImportStatus("uploading");
      setUploadProgress(0);
      setImportError(null);

      const presignRes = await fetch("/api/vault/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentLength: file.size }),
      });
      if (!presignRes.ok) {
        throw new Error(
          await readResponseError(presignRes, t("Failed to get upload URL")),
        );
      }
      const { uploadUrl, s3Key, contentLength } = await presignRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "application/zip");
        xhr.setRequestHeader("x-amz-meta-expected-size", String(contentLength));
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status < 400
            ? resolve()
            : reject(
                new Error(t("Upload failed: {status}", { status: xhr.status })),
              );
        xhr.onerror = () => reject(new Error(t("Upload failed")));
        xhr.send(file);
      });

      setImportStatus("processing");
      setUploadProgress(100);

      async function startImport(force = false) {
        const startRes = await fetch("/api/vault/import/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(force ? { s3Key, force: true } : { s3Key }),
        });

        if (startRes.status === 409) {
          setImportStatus(null);
          const ok = confirm(
            t("An import is already in progress. Cancel it and start a new one?"),
          );
          if (!ok) return null;
          return startImport(true);
        }

        if (!startRes.ok) {
          throw new Error(
            await readResponseError(startRes, t("Failed to start import")),
          );
        }
        return startRes.json();
      }

      const result = await startImport();
      if (!result) return;
      const { jobId } = result;
      // a confirmed replacement went through the 409 branch, which cleared the status
      setImportStatus("processing");
      setImportJobId(jobId);

      toast.success(t("Import started! Processing your vault..."));
    };
    await run()
      .catch((err: unknown) => {
        console.error("Vault import failed:", err);
        setImportStatus("failed");
        const message = err instanceof Error ? err.message : t("Import failed");
        setImportError(message);
        toast.error(message);
      })
      .finally(() => {
        input.value = "";
      });
  }

  async function handleVaultExport() {
    // a running export answers 409; confirming replaces it with a forced export
    const run = async () => {
      let force = false;
      while (true) {
        setExportStatus("processing");
        setExportDownloadUrl(null);
        setExportError(null);

        const url = force ? "/api/vault/export?force=true" : "/api/vault/export";
        const res = await fetch(url, { method: "POST" });

        if (res.status === 409) {
          setExportStatus(null);
          await res.json();
          const ok = confirm(
            t("An export is already in progress. Cancel it and start a new one?"),
          );
          if (!ok) return;
          force = true;
          continue;
        }

        if (!res.ok) {
          throw new Error(
            await readResponseError(res, t("Failed to start export")),
          );
        }
        const { jobId } = await res.json();
        setExportJobId(jobId);

        toast.success(t("Export started! We'll notify you when it's ready."));
        return;
      }
    };
    await run()
      .catch((err: unknown) => {
        console.error("Vault export failed:", err);
        setExportStatus("failed");
        const message = err instanceof Error ? err.message : t("Export failed");
        setExportError(message);
        toast.error(message);
      });
  }

  async function cancelVaultJob(jobId: string) {
    const response = await fetch(`/api/vault/jobs/${jobId}/cancel`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("cancel failed");
    }
  }

  async function handleCancelImport() {
    if (!importJobId) return;
    if (!confirm(t("Stop this import? Files processed so far will remain."))) return;
    setImportCancelRequested(true);
    const run = async () => {
      await cancelVaultJob(importJobId);
      toast.info(t("Import cancellation requested. Stopping after current file..."));
    };
    await run()
      .catch(() => {
        setImportCancelRequested(false);
        toast.error(t("Failed to cancel import"));
      });
  }

  async function handleCancelExport() {
    if (!exportJobId) return;
    if (!confirm(t("Stop this export?"))) return;
    setExportCancelRequested(true);
    const run = async () => {
      await cancelVaultJob(exportJobId);
      toast.info(t("Export cancellation requested. Stopping after current file..."));
    };
    await run()
      .catch(() => {
        setExportCancelRequested(false);
        toast.error(t("Failed to cancel export"));
      });
  }

  const importPollingActive =
    !!importJobId &&
    importStatus !== "complete" &&
    importStatus !== "failed" &&
    importStatus !== "cancelled";

  const handleImportPollData = (data: JobData) => {
    const { job, progress } = data;
    if (!job) {
      // the job row is gone (Clear Vault deletes it), so there is nothing left to watch
      setImportStatus(null);
      setImportCancelRequested(false);
      return true;
    }
    if (job.status === "complete") {
      setImportStatus("complete");
      if (progress) setImportProgress(progress);
      setImportCancelRequested(false);
      toast.success(t("Vault import complete!"));
      return true;
    }
    if (job.status === "cancelled") {
      setImportStatus("cancelled");
      if (progress) setImportProgress(progress);
      setImportCancelRequested(false);
      toast.info(t("Import cancelled."));
      return true;
    }
    if (job.status === "failed") {
      setImportStatus("failed");
      setImportCancelRequested(false);
      const message = job.error || t("Import failed");
      setImportError(message);
      toast.error(message);
      return true;
    }
    if (progress) {
      setImportProgress(progress);
    }
    return false;
  };

  usePollingJob({
    url: "/api/vault/status?type=vault-import",
    interval: 3000,
    enabled: importPollingActive,
    onData: handleImportPollData,
  });

  const exportPollingActive =
    !!exportJobId &&
    exportStatus !== "complete" &&
    exportStatus !== "failed" &&
    exportStatus !== "cancelled";

  const handleExportPollData = (data: JobData) => {
    const { job, downloadUrl, progress } = data;
    if (!job) {
      setExportStatus(null);
      setExportCancelRequested(false);
      return true;
    }
    if (job.status === "complete") {
      // no link means the archive already expired, so there is nothing to offer
      setExportStatus(downloadUrl ? "complete" : null);
      setExportDownloadUrl(downloadUrl ?? null);
      if (progress) setExportProgress(progress);
      setExportCancelRequested(false);
      if (downloadUrl) toast.success(t("Vault export ready!"));
      return true;
    }
    if (job.status === "cancelled") {
      setExportStatus("cancelled");
      if (progress) setExportProgress(progress);
      setExportCancelRequested(false);
      toast.info(t("Export cancelled."));
      return true;
    }
    if (job.status === "failed") {
      setExportStatus("failed");
      setExportCancelRequested(false);
      const message = job.error || t("Export failed");
      setExportError(message);
      toast.error(message);
      return true;
    }
    if (progress) {
      setExportProgress(progress);
    }
    return false;
  };

  usePollingJob({
    url: "/api/vault/status?type=vault-export",
    interval: 3000,
    enabled: exportPollingActive,
    onData: handleExportPollData,
  });

  useEffect(() => {
    async function checkExistingJobs() {
      const run = async () => {
        const [importRes, exportRes] = await Promise.all([
          fetch("/api/vault/status?type=vault-import"),
          fetch("/api/vault/status?type=vault-export"),
        ]);
        if (importRes.ok) {
          const { job, progress } = await importRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setImportStatus("processing");
            setImportJobId(job.jobId);
            setImportProgress(progress ?? null);
            setImportCancelRequested(Boolean(job.cancelRequested));
          } else if (job?.status === "complete") {
            setImportStatus("complete");
            setImportProgress(progress ?? null);
          } else if (job?.status === "failed") {
            setImportStatus("failed");
            setImportError(job.error || null);
          }
        }
        if (exportRes.ok) {
          const { job, downloadUrl, progress } = await exportRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setExportStatus("processing");
            setExportJobId(job.jobId);
            setExportProgress(progress ?? null);
            setExportCancelRequested(Boolean(job.cancelRequested));
          } else if (job?.status === "complete" && downloadUrl) {
            setExportStatus("complete");
            setExportDownloadUrl(downloadUrl);
            setExportProgress(progress ?? null);
          } else if (job?.status === "failed") {
            setExportStatus("failed");
            setExportError(job.error || null);
          }
        }
      };
      await run()
        .catch(() => {

        });
    }
    checkExistingJobs();
  }, []);

  return (
    <SettingsCard
      id="data"
      title={t("Data & Export")}
      description={t("Import or export your notes in various formats.")}
    >
      <SettingsCardBody className="divide-y divide-border-subtle py-0">
          <div className="py-5">
            <h3 className="text-sm/6 font-medium text-text">
              {t("Import Notes")}
            </h3>
            <p className="text-xs text-text-tertiary mb-3">
              {t(
                "Upload a .zip file to import folders and notes. Supports PDF, DOCX, Markdown, and more. Max 10GB.",
              )}
            </p>

            {importStatus === "uploading" && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
                  <span>{t("Uploading...")}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-subtle rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {importStatus === "processing" && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
                  <span>
                    {importProgress
                      ? importProgress.total > 0
                        ? `${t("Processing")} ${importProgress.completed}/${importProgress.total} ${t("files")}...`
                        : `${t("Processing")} ${importProgress.completed} ${t("files")}...`
                      : t("Processing...")}
                  </span>
                  {importProgress?.percent != null && (
                    <span>{importProgress.percent}%</span>
                  )}
                </div>
                <div className="w-full bg-subtle rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${importProgress?.percent ?? 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {importStatus === "complete" && (
              <div className={`mb-4 ${successNoticeClass}`}>
                {t("Import complete!")}
                {importProgress &&
                  ` ${importProgress.completed} ${t("files processed")}.`}
              </div>
            )}

            {importStatus === "failed" && (
              <div className={`mb-4 ${errorNoticeClass}`}>
                {importError || t("Import failed. Please try again.")}
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".zip"
                onChange={handleVaultImport}
                disabled={
                  importStatus === "uploading" || importStatus === "processing"
                }
                className="hidden"
                id="vault-import-file"
              />
              <label
                htmlFor="vault-import-file"
                className={cn(
                  secondaryBtnClass,
                  "cursor-pointer",
                  importStatus === "uploading" || importStatus === "processing"
                    ? "opacity-50 cursor-not-allowed"
                    : "",
                )}
              >
                {importStatus === "uploading"
                  ? t("Uploading...")
                  : importStatus === "processing"
                    ? t("Processing...")
                    : t("Select .zip file")}
              </label>
              {importStatus === "processing" && (
                <button
                  type="button"
                  onClick={handleCancelImport}
                  disabled={importCancelRequested}
                  className={cn(
                    secondaryBtnClass,
                    importCancelRequested ? "opacity-50 cursor-not-allowed" : "",
                  )}
                >
                  {importCancelRequested ? t("Cancelling...") : t("Cancel")}
                </button>
              )}
            </div>
          </div>

          <div className="py-5">
            <h3 className="text-sm/6 font-medium text-text">
              {t("Export Notes")}
            </h3>
            <p className="text-xs text-text-tertiary mb-3">
              {t("Download all your notes and files as a zip archive.")}
            </p>

            {exportStatus === "processing" && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-text-secondary mb-1">
                  <span>
                    {exportProgress
                      ? `${t("Exporting")} ${exportProgress.completed}/${exportProgress.total} ${t("files")}...`
                      : t("Generating export... This may take a few minutes.")}
                  </span>
                  {exportProgress?.percent != null && (
                    <span>{exportProgress.percent}%</span>
                  )}
                </div>
                <div className="w-full bg-subtle rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${exportProgress?.percent ?? 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {exportStatus === "complete" && exportDownloadUrl && (
              <div className="mb-4">
                <div className={`mb-3 ${successNoticeClass}`}>
                  {t("Export ready!")}
                </div>
                <a
                  href={exportDownloadUrl}
                  download
                  className={saveBtnClass}
                >
                  {t("Download oghmanotes-vault.zip")}
                </a>
                <p className="mt-2 text-xs text-text-tertiary">
                  {t("Link expires in 24 hours.")}
                </p>
              </div>
            )}

            {exportStatus === "failed" && (
              <div className={`mb-4 ${errorNoticeClass}`}>
                {exportError || t("Export failed. Please try again.")}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleVaultExport()}
                disabled={exportStatus === "processing"}
                className={cn(
                  secondaryBtnClass,
                  exportStatus === "processing"
                    ? "opacity-50 cursor-not-allowed"
                    : "",
                )}
              >
                {exportStatus === "processing"
                  ? t("Exporting...")
                  : t("Export vault")}
              </button>
              {exportStatus === "processing" && (
                <button
                  type="button"
                  onClick={handleCancelExport}
                  disabled={exportCancelRequested}
                  className={cn(
                    secondaryBtnClass,
                    exportCancelRequested ? "opacity-50 cursor-not-allowed" : "",
                  )}
                >
                  {exportCancelRequested ? t("Cancelling...") : t("Cancel")}
                </button>
              )}
            </div>
          </div>

          <div className="py-5">
            <h3 className="text-sm/6 font-medium text-text">
              {t("Calendar Subscription")}
            </h3>
            <p className="text-xs text-text-tertiary mb-3">
              {t("Subscribe to your assignments and study blocks in Google Calendar, Apple Calendar, Outlook, or any app that supports iCal feeds.")}
            </p>

            {calendarLoading ? (
              <p className="text-sm text-text-tertiary">{t("Loading...")}</p>
            ) : calendarToken ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    readOnly
                    aria-label={t("Calendar Subscription")}
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/ical/${calendarToken}`}
                    className="block min-h-11 min-w-0 flex-1 truncate rounded-radius-md border border-border bg-subtle px-3 py-2 font-mono text-xs text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:min-h-9"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCalendarUrl}
                      className={secondaryBtnClass}
                      title={t("Copy URL")}
                    >
                      {calendarCopied ? (
                        <CheckIcon className="h-4 w-4 text-success-700 dark:text-success-400" aria-hidden="true" />
                      ) : (
                        <ClipboardDocumentIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                      )}
                      {calendarCopied ? t("Copied") : t("Copy URL")}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateToken}
                      disabled={calendarRegenerating}
                      className={secondaryBtnClass}
                    >
                      <ArrowPathIcon className={`h-4 w-4 text-text-tertiary ${calendarRegenerating ? "animate-spin" : ""}`} aria-hidden="true" />
                      {t("Regenerate URL")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${errorTextClass}`}>{t("Failed to load subscription URL")}</p>
            )}
          </div>
      </SettingsCardBody>
    </SettingsCard>
  );
}
