"use client";

import { useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  saveNativeOfflineNote,
  supportsNativeOffline,
  useNativeAppBridge,
} from "@/lib/native-app";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useSaveIndicatorStore from "@/lib/notes/state/save-indicator";

export default function SaveOfflineButton({ noteId }: { noteId: string }) {
  const { t } = useI18n();
  const bridge = useNativeAppBridge();
  const state = useSaveIndicatorStore((store) => store.files[noteId]?.state);
  const [busy, setBusy] = useState(false);
  if (!bridge || !supportsNativeOffline()) return null;
  const unsaved = !!state && state !== "saved";
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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-40 md:h-7 md:w-7"
    >
      <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
