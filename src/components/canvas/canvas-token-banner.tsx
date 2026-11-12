"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

const tokenStateSchema = z.object({
  connected: z.boolean(),
  invalidSince: z.string().nullable(),
});

const DISMISS_KEY = "oghma-canvas-banner-dismissed";

// the "Canvas sync paused" bar from the Atlas states mockup. it reads what the
// last canvas request recorded, so it never calls canvas itself
export default function CanvasTokenBanner() {
  const { t } = useI18n();
  const [invalidSince, setInvalidSince] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/canvas/token-state", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => (response.ok ? tokenStateSchema.safeParse(await response.json()) : null))
      .then((parsed) => {
        if (!parsed?.success || !parsed.data.connected || !parsed.data.invalidSince) return;
        // dismissing hides this occurrence only, a later rejection shows it again
        let dismissed: string | null = null;
        try {
          dismissed = sessionStorage.getItem(DISMISS_KEY);
        } catch {
          dismissed = null;
        }
        if (dismissed !== parsed.data.invalidSince) setInvalidSince(parsed.data.invalidSince);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!invalidSince) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, invalidSince);
    } catch {
      // storage can be unavailable, the banner just comes back next load
    }
    setInvalidSince(null);
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-error-500/25 bg-error-50 px-4 py-2.5 text-sm text-error-800 dark:bg-error-500/10 dark:text-error-300"
    >
      <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t("Canvas sync paused.")}</span>{" "}
        {t("Your Canvas token is invalid or expired. Please reconnect. Notes already imported are safe.")}
      </p>
      <a
        href="/settings#canvas"
        className="shrink-0 rounded-radius-md border border-error-500/40 bg-surface px-3 py-1 text-xs font-semibold text-error-700 hover:bg-subtle dark:text-error-300"
      >
        {t("Reconnect")}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("Dismiss")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-radius-md hover:bg-error-500/10"
      >
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
