"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { ClipboardDocumentIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { cn } from "./settings-utils";

export default function DataExportSection() {
  const { t } = useI18n();

  // calendar subscription state
  const [calendarToken, setCalendarToken] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarRegenerating, setCalendarRegenerating] = useState(false);

  // vault import/export state
  const [importStatus, setImportStatus] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [importJobId, setImportJobId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState(null);
  const [exportJobId, setExportJobId] = useState(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState(null);
  const importFileRef = useRef(null);

  // fetch calendar token on mount
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
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t("Copied to clipboard"));
    });
  }

  // vault import handler
  async function handleVaultImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast.error(t("Please select a .zip file"));
      return;
    }

    try {
      setImportStatus("uploading");
      setUploadProgress(0);

      const presignRes = await fetch("/api/vault/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentLength: file.size }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error || "Failed to get upload URL");
      }
      const { uploadUrl, s3Key } = await presignRes.json();

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", "application/zip");
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status < 400
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      setImportStatus("processing");
      setUploadProgress(100);

      const startRes = await fetch("/api/vault/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start import");
      }
      const { jobId } = await startRes.json();
      setImportJobId(jobId);

      toast.success(t("Import started! Processing your vault..."));
    } catch (err) {
      console.error("Vault import failed:", err);
      setImportStatus("failed");
      toast.error(err.message || t("Import failed"));
    }

    if (importFileRef.current) importFileRef.current.value = "";
  }

  // vault export handler
  async function handleVaultExport() {
    try {
      setExportStatus("processing");
      setExportDownloadUrl(null);

      const res = await fetch("/api/vault/export", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start export");
      }
      const { jobId } = await res.json();
      setExportJobId(jobId);

      toast.success(t("Export started! We'll notify you when it's ready."));
    } catch (err) {
      console.error("Vault export failed:", err);
      setExportStatus("failed");
      toast.error(err.message || t("Export failed"));
    }
  }

  // poll import status
  useEffect(() => {
    if (
      !importJobId ||
      importStatus === "complete" ||
      importStatus === "failed"
    )
      return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/vault/status?type=vault-import");
        if (!res.ok) return;
        const { job, progress } = await res.json();
        if (!job) return;
        if (job.status === "complete") {
          setImportStatus("complete");
          setImportProgress(progress);
          toast.success(t("Vault import complete!"));
          clearInterval(interval);
        } else if (job.status === "failed") {
          setImportStatus("failed");
          toast.error(job.error || t("Import failed"));
          clearInterval(interval);
        } else if (progress) {
          setImportProgress(progress);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [importJobId, importStatus, t]);

  // poll export status
  useEffect(() => {
    if (
      !exportJobId ||
      exportStatus === "complete" ||
      exportStatus === "failed"
    )
      return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/vault/status?type=vault-export");
        if (!res.ok) return;
        const { job, downloadUrl } = await res.json();
        if (!job) return;
        if (job.status === "complete" && downloadUrl) {
          setExportStatus("complete");
          setExportDownloadUrl(downloadUrl);
          toast.success(t("Vault export ready!"));
          clearInterval(interval);
        } else if (job.status === "failed") {
          setExportStatus("failed");
          toast.error(job.error || t("Export failed"));
          clearInterval(interval);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [exportJobId, exportStatus, t]);

  // check for existing vault jobs on mount
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
          }
        }
        if (exportRes.ok) {
          const { job, downloadUrl } = await exportRes.json();
          if (job && ["queued", "processing"].includes(job.status)) {
            setExportStatus("processing");
            setExportJobId(job.jobId);
          } else if (job?.status === "complete" && downloadUrl) {
            setExportStatus("complete");
            setExportDownloadUrl(downloadUrl);
          }
        }
      } catch {
        /* ignore */
      }
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
          {/* import section */}
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
              <div className="mb-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20">
                {t("Import complete!")}
                {importProgress &&
                  ` ${importProgress.completed} ${t("files processed")}.`}
              </div>
            )}

            {importStatus === "failed" && (
              <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                {t("Import failed. Please try again.")}
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                ref={importFileRef}
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
            </div>
          </div>

          {/* export section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-sm/6 font-medium text-text mb-1">
              {t("Export Notes")}
            </h3>
            <p className="text-sm text-text-tertiary mb-4">
              {t("Download all your notes and files as a zip archive.")}
            </p>

            {exportStatus === "processing" && (
              <div className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
                <svg
                  className="animate-spin h-4 w-4 text-primary-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t("Generating export... This may take a few minutes.")}
              </div>
            )}

            {exportStatus === "complete" && exportDownloadUrl && (
              <div className="mb-4">
                <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400 ring-1 ring-inset ring-green-500/20 mb-3">
                  {t("Export ready!")}
                </div>
                <a
                  href={exportDownloadUrl}
                  download
                  className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-400 inline-block"
                >
                  {t("Download vault.zip")}
                </a>
                <p className="mt-2 text-xs text-text-tertiary">
                  {t("Link expires in 24 hours.")}
                </p>
              </div>
            )}

            {exportStatus === "failed" && (
              <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                {t("Export failed. Please try again.")}
              </div>
            )}

            <button
              type="button"
              onClick={handleVaultExport}
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
          </div>

          {/* calendar subscription */}
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
