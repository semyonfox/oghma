"use client";

import { type ChangeEvent, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ClipboardDocumentIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { cn, readResponseError } from "./settings-utils";
import { usePollingJob } from "@/lib/hooks/use-polling-job";

type ExportStatus = "uploading" | "processing" | "complete" | "failed" | "cancelled";
type Progress = { completed: number; total: number; percent?: number };
type JobData = { job?: { status?: string; error?: string; jobId?: string }; progress?: Progress; downloadUrl?: string };

export default function DataExportSection() {
  const { t } = useI18n();

  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarRegenerating, setCalendarRegenerating] = useState(false);

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
    try {
      const res = await fetch("/api/calendar/token", { method: "POST" });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      setCalendarToken(token);
      toast.success(t("Calendar subscription URL regenerated"));
    } catch {
      toast.error(t("Failed to regenerate token"));
    } finally {
      setCalendarRegenerating(false);
    }
  }

  function handleCopyCalendarUrl() {
    const url = `${window.location.origin}/api/calendar/ical/${calendarToken}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("Copied to clipboard")))
      .catch(() => toast.error(t("Failed to copy URL")));
  }

  async function handleVaultImport(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        toast.error(t("Please select a .zip file"));
        return;
      }

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
      setImportJobId(jobId);

      toast.success(t("Import started! Processing your vault..."));
    } catch (err: unknown) {
      console.error("Vault import failed:", err);
      setImportStatus("failed");
      const message = err instanceof Error ? err.message : t("Import failed");
      setImportError(message);
      toast.error(message);
    } finally {
      input.value = "";
    }
  }

  async function handleVaultExport({ force = false } = {}) {
    try {
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
        return handleVaultExport({ force: true });
      }

      if (!res.ok) {
        throw new Error(
          await readResponseError(res, t("Failed to start export")),
        );
      }
      const { jobId } = await res.json();
      setExportJobId(jobId);

      toast.success(t("Export started! We'll notify you when it's ready."));
    } catch (err: unknown) {
      console.error("Vault export failed:", err);
      setExportStatus("failed");
      const message = err instanceof Error ? err.message : t("Export failed");
      setExportError(message);
      toast.error(message);
    }
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
    try {
      await cancelVaultJob(importJobId);
      toast.info(t("Import cancellation requested. Stopping after current file..."));
    } catch {
      setImportCancelRequested(false);
      toast.error(t("Failed to cancel import"));
    }
  }

  async function handleCancelExport() {
    if (!exportJobId) return;
    if (!confirm(t("Stop this export?"))) return;
    setExportCancelRequested(true);
    try {
      await cancelVaultJob(exportJobId);
      toast.info(t("Export cancellation requested. Stopping after current file..."));
    } catch {
      setExportCancelRequested(false);
      toast.error(t("Failed to cancel export"));
    }
  }

  const importPollingActive =
    !!importJobId &&
    importStatus !== "complete" &&
    importStatus !== "failed" &&
    importStatus !== "cancelled";

  const handleImportPollData = useCallback(
    (data: JobData) => {
      const { job, progress } = data;
      if (!job) return false;
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
    },
    [t],
  );

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

  const handleExportPollData = useCallback(
    (data: JobData) => {
      const { job, downloadUrl, progress } = data;
      if (!job) return false;
      if (job.status === "complete" && downloadUrl) {
        setExportStatus("complete");
        setExportDownloadUrl(downloadUrl);
        if (progress) setExportProgress(progress);
        setExportCancelRequested(false);
        toast.success(t("Vault export ready!"));
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
    },
    [t],
  );

  usePollingJob({
    url: "/api/vault/status?type=vault-export",
    interval: 3000,
    enabled: exportPollingActive,
    onData: handleExportPollData,
  });

  useEffect(() => {
    async function checkExistingJobs() {
      try {
        const [importRes, exportRes] = await Promise.all([
          fetch("/api/vault/status?type=vault-import"),
          fetch("/api/vault/status?type=vault-export"),
        ]);
        if (importRes.ok) {
          const { job, progress } = await importRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setImportStatus("processing");
            setImportJobId(job.jobId);
            setImportProgress(progress);
          } else if (job?.status === "complete") {
            setImportStatus("complete");
            setImportProgress(progress);
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
            setExportProgress(progress);
          } else if (job?.status === "complete" && downloadUrl) {
            setExportStatus("complete");
            setExportDownloadUrl(downloadUrl);
            setExportProgress(progress);
          } else if (job?.status === "failed") {
            setExportStatus("failed");
            setExportError(job.error || null);
          }
        }
      } catch {}
    }
    checkExistingJobs();
  }, []);

  return (
    <div
      id="data"
      className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
    >
      <div>
        <h2 className="text-base/7 font-semibold text-text">
          {t("Data & Export")}
        </h2>
        <p className="mt-1 text-sm/6 text-text-tertiary">
          {t("Import or export your notes in various formats.")}
        </p>
      </div>

      <div className="md:col-span-2">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm/6 font-medium text-text mb-1">
              {t("Import Notes")}
            </h3>
            <p className="text-sm text-text-tertiary mb-4">
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
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
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
                      ? `${t("Processing")} ${importProgress.completed}/${importProgress.total} ${t("files")}...`
                      : t("Processing...")}
                  </span>
                  {importProgress?.percent != null && (
                    <span>{importProgress.percent}%</span>
                  )}
                </div>
                <div className="w-full bg-subtle rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${importProgress?.percent ?? 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {importStatus === "complete" && (
              <div className="mb-4 rounded-radius-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20">
                {t("Import complete!")}
                {importProgress &&
                  ` ${importProgress.completed} ${t("files processed")}.`}
              </div>
            )}

            {importStatus === "failed" && (
              <div className="mb-4 rounded-radius-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
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
                  "glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text cursor-pointer",
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
                    "glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text",
                    importCancelRequested ? "opacity-50 cursor-not-allowed" : "",
                  )}
                >
                  {importCancelRequested ? t("Cancelling...") : t("Cancel")}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-sm/6 font-medium text-text mb-1">
              {t("Export Notes")}
            </h3>
            <p className="text-sm text-text-tertiary mb-4">
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
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${exportProgress?.percent ?? 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {exportStatus === "complete" && exportDownloadUrl && (
              <div className="mb-4">
                <div className="rounded-radius-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20 mb-3">
                  {t("Export ready!")}
                </div>
                <a
                  href={exportDownloadUrl}
                  download
                  className="rounded-radius-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 inline-block"
                >
                  {t("Download oghmanotes-vault.zip")}
                </a>
                <p className="mt-2 text-xs text-text-tertiary">
                  {t("Link expires in 24 hours.")}
                </p>
              </div>
            )}

            {exportStatus === "failed" && (
              <div className="mb-4 rounded-radius-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                {exportError || t("Export failed. Please try again.")}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleVaultExport()}
                disabled={exportStatus === "processing"}
                className={cn(
                  "glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text",
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
                    "glass-card-interactive rounded-radius-md px-3 py-2 text-sm font-semibold text-text",
                    exportCancelRequested ? "opacity-50 cursor-not-allowed" : "",
                  )}
                >
                  {exportCancelRequested ? t("Cancelling...") : t("Cancel")}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-sm/6 font-medium text-text mb-1">
              {t("Calendar Subscription")}
            </h3>
            <p className="text-sm text-text-tertiary mb-4">
              {t("Subscribe to your assignments and study blocks in Google Calendar, Apple Calendar, Outlook, or any app that supports iCal feeds.")}
            </p>

            {calendarLoading ? (
              <p className="text-sm text-text-tertiary">{t("Loading...")}</p>
            ) : calendarToken ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/ical/${calendarToken}`}
                    className="flex-1 rounded-radius-md glass-card px-3 py-2 text-xs text-text-secondary font-mono truncate focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCalendarUrl}
                    className="shrink-0 glass-card-interactive rounded-radius-md p-2 text-text-tertiary hover:text-text-secondary"
                    title={t("Copy URL")}
                  >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={calendarRegenerating}
                  className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-50"
                >
                  <ArrowPathIcon className={`h-3.5 w-3.5 ${calendarRegenerating ? "animate-spin" : ""}`} />
                  {t("Regenerate URL")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-error-400">{t("Failed to load subscription URL")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
