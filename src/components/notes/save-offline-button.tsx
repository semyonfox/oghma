"use client";

import { useState } from "react";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  saveNativeOfflineNote,
  supportsNativeOffline,
  useNativeAppBridge,
} from "@/lib/native-app";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useSaveIndicatorStore, { saveIndicatorKey } from "@/lib/notes/state/save-indicator";

export default function SaveOfflineButton({
  noteId,
  presentation = "icon",
}: {
  noteId: string;
  presentation?: "icon" | "row";
}) {
  const { t } = useI18n();
  const bridge = useNativeAppBridge();
  const unsaved = useSaveIndicatorStore((store) => {
    const indicators = [store.files[noteId], store.files[saveIndicatorKey(noteId, "B")]];
    return !indicators.some((indicator) => indicator) ||
      indicators.some((indicator) => indicator && (indicator.ready === false || indicator.state !== "saved"));
  });
  const [busy, setBusy] = useState(false);
  if (!bridge || !supportsNativeOffline()) return null;
  const label = unsaved
    ? t("Save your changes before downloading")
    : t("Save offline");
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy || unsaved}
      aria-busy={busy}
      onClick={() => {
        setBusy(true);
        void saveNativeOfflineNote(noteId)
          .catch((error: unknown) =>
            toast.error(
              error instanceof Error
                ? error.message
                : t("Could not save offline"),
            ),
          )
          .finally(() => setBusy(false));
      }}
      className={
        presentation === "row"
          ? "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-text-secondary hover:bg-subtle disabled:opacity-50"
          : "ui-icon-button"
      }
    >
      {busy ? (
        <ArrowPathIcon className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
      )}
      {presentation === "row" && <span>{label}</span>}
    </button>
  );
}
