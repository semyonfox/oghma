"use client";

import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { canvasHostFromInput } from "@/lib/canvas/institution-search";
import { useRef, useState, type RefObject } from "react";
import CanvasInstitutionPicker from "./canvas-institution-picker";
import {
  errorTextClass,
  inputClass,
  saveBtnClass,
  warningNoticeClass,
} from "../settings-utils";

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
  const domainInputRef = useRef<HTMLInputElement>(null);
  const [showDomainError, setShowDomainError] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const handleConnect = () => {
    if (isConnecting) return;

    const missingToken = !tokenInputRef.current?.value.trim();
    setShowDomainError(!canvasHost);
    setTokenMissing(missingToken);
    if (!canvasHost || missingToken) {
      (canvasHost ? tokenInputRef : domainInputRef).current?.focus();
      return;
    }

    onConnect();
  };

  return (
    <>
      {connectionWarning && (
        <div
          role="alert"
          className={`flex items-center gap-2 ${warningNoticeClass}`}
        >
          <ExclamationTriangleIcon
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          {connectionWarning}
        </div>
      )}

      <CanvasInstitutionPicker
        domain={domain}
        setDomain={(value) => {
          setDomain(value);
          if (value) setShowDomainError(false);
        }}
        fieldRef={domainInputRef}
        showError={showDomainError && !canvasHost}
      />

      <div className="rounded-radius-lg border border-border bg-surface-elevated p-4">
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
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
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
              "Set an expiration date and time for how long you plan to use this connection.",
            )}
          </li>
          <li>
            {t("Click")}{" "}
            <span className="text-text-secondary">{t("Generate Token")}</span>
          </li>
          <li>
            {t(
              "Copy the whole long code under Access Token Details into API Token below. It may include letters, numbers, and symbols.",
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
            aria-invalid={tokenMissing}
            aria-describedby={tokenMissing ? "canvas-token-help canvas-token-error" : "canvas-token-help"}
            onChange={(event) => {
              if (event.currentTarget.value.trim()) setTokenMissing(false);
            }}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("Paste your Canvas API token here")}
            className={inputClass}
          />
          {tokenMissing && (
            <p id="canvas-token-error" role="alert" className={`mt-1 text-xs ${errorTextClass}`}>
              {t("Enter your Canvas API token.")}
            </p>
          )}
        </div>
      </div>

      <p id="canvas-token-help" className="text-xs text-text-tertiary">
        {t(
          "The token is the long code Canvas generated, not your email, the name OghmaNotes, or your Canvas address.",
        )}
      </p>

      {connectionError && (
        <div role="alert" className={`flex items-center gap-2 text-sm ${errorTextClass}`}>
          <ExclamationCircleIcon className="size-4 shrink-0" />
          {connectionError}
        </div>
      )}

      <button
        type="button"
        aria-disabled={isConnecting}
        onClick={handleConnect}
        className={`${saveBtnClass} justify-self-start`}
      >
        {isConnecting ? t("Connecting…") : t("Connect Canvas")}
      </button>
    </>
  );
}
