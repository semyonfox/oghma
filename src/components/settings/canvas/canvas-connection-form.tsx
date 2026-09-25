"use client";

import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { canvasHostFromInput } from "@/lib/canvas/institution-search";
import type { RefObject } from "react";
import CanvasInstitutionPicker from "./canvas-institution-picker";

type CanvasConnectionFormProps = {
  domain: string;
  setDomain: (value: string) => void;
  tokenInputRef: RefObject<HTMLInputElement | null>;
  isConnecting: boolean;
  connectionError?: string | null;
  connectionWarning?: string | null;
  onConnect: () => void;
};

export default function CanvasConnectionForm({
  domain,
  setDomain,
  tokenInputRef,
  isConnecting,
  connectionError,
  connectionWarning,
  onConnect,
}: CanvasConnectionFormProps) {
  const { t } = useI18n();
  const canvasHost = canvasHostFromInput(domain);

  return (
    <>
      {connectionWarning && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-radius-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400 ring-1 ring-yellow-500/20"
        >
          <ExclamationTriangleIcon
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          {connectionWarning}
        </div>
      )}

      <CanvasInstitutionPicker domain={domain} setDomain={setDomain} />

      <div className="glass-card rounded-radius-lg p-4">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">
          {t("How to generate your Canvas API token")}
        </h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-text-tertiary">
          <li>
            {canvasHost ? (
              <a
                href={`https://${canvasHost}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 underline underline-offset-2"
              >
                {t("Log into your Canvas account")}
              </a>
            ) : (
              t("Log into your Canvas account")
            )}
          </li>
          <li>{t("Open Account → Settings in Canvas")}</li>
          <li>
            {t("Scroll down to")}{" "}
            <span className="text-text-secondary">
              {t("Approved Integrations")}
            </span>
          </li>
          <li>
            {t("Click")}{" "}
            <span className="text-text-secondary">
              {t("Add New Access Token")}
            </span>
          </li>
          <li>{t("Name the token OghmaNotes")}</li>
          <li>
            {t(
              "Choose an expiration date and time. Canvas requires a date for students.",
            )}
          </li>
          <li>
            {t("Click")}{" "}
            <span className="text-text-secondary">{t("Generate Token")}</span>
          </li>
          <li>
            {t(
              "Copy the token into API Token below. Canvas only shows it once.",
            )}
          </li>
        </ol>
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

      <p className="text-xs text-text-tertiary">
        {t(
          "Use your Canvas account's token. Your OghmaNotes email can be different from your Canvas email.",
        )}
      </p>

      {connectionError && (
        <div role="alert" className="flex items-center gap-2 text-sm text-red-400">
          <ExclamationCircleIcon className="size-4 shrink-0" />
          {connectionError}
        </div>
      )}

      <button
        type="button"
        disabled={!canvasHost || isConnecting}
        onClick={onConnect}
        className="rounded-radius-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? t("Connecting...") : t("Connect Canvas")}
      </button>
    </>
  );
}
