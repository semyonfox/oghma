"use client";

import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function CanvasConnectionForm({
  domain,
  setDomain,
  tokenInputRef,
  isConnecting,
  connectionError,
  connectionWarning,
  onConnect,
}) {
  const { t } = useI18n();

  return (
    <>
      {/* expired / invalid token warning */}
      {connectionWarning && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400 ring-1 ring-yellow-500/20">
          <svg
            className="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          {connectionWarning}
        </div>
      )}

      {/* how to get your token */}
      <div className="glass-card rounded-radius-lg p-4">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">
          {t("How to generate your Canvas API token")}
        </h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-text-tertiary">
          <li>{t("Log into your Canvas account")}</li>
          <li>
            {t("Click your profile picture →")}{" "}
            <span className="text-text-secondary">{t("Settings")}</span>
          </li>
          <li>
            {t("Scroll down to")}{" "}
            <span className="text-text-secondary">
              {t("Approved Integrations")}
            </span>
          </li>
          <li>
            {t("Click")}{" "}
            <span className="text-text-secondary">
              {t("+ New Access Token")}
            </span>
          </li>
          <li>
            {t('Give it a name (e.g. "OghmaNotes") and click')}{" "}
            <span className="text-text-secondary">{t("Generate Token")}</span>
          </li>
          <li>
            {t(
              "Copy the token and paste it below — Canvas will only show it once",
            )}
          </li>
        </ol>
      </div>

      {/* connection form */}
      <div>
        <label
          htmlFor="canvas-domain"
          className="block text-sm/6 font-medium text-text-secondary"
        >
          {t("Canvas Domain")}
        </label>
        <p className="mt-1 text-xs text-text-tertiary">
          {t("Your institution's Canvas URL e.g.")}{" "}
          <span className="text-text-secondary">
            universityofgalway.instructure.com
          </span>
        </p>
        <div className="mt-2">
          <input
            id="canvas-domain"
            type="text"
            placeholder="universityofgalway.instructure.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="canvas-token"
          className="block text-sm/6 font-medium text-text-secondary"
        >
          {t("API Token")}
        </label>
        <div className="mt-2">
          <input
            ref={tokenInputRef}
            id="canvas-token"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("Paste your Canvas API token here")}
            className="block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
          />
        </div>
      </div>

      {connectionError && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <ExclamationCircleIcon className="size-4 shrink-0" />
          {connectionError}
        </div>
      )}

      <button
        type="button"
        disabled={!domain || isConnecting}
        onClick={onConnect}
        className="rounded-md bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? t("Connecting...") : t("Connect Canvas")}
      </button>
    </>
  );
}
