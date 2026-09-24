"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useWorkspaceSession } from "@/components/providers/workspace-lifecycle-provider";
import { isValidUUID } from "@/lib/utils/uuid";

export default function FirstLoginWelcome() {
  const { t } = useI18n();
  const router = useRouter();
  const { userId, ready } = useWorkspaceSession();
  const descriptionId = useId();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setNoteId(null);
    if (!ready || !userId) return;

    const controller = new AbortController();
    void fetch("/api/onboarding/welcome", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (controller.signal.aborted || !data || typeof data !== "object") return;
        const candidate = Reflect.get(data, "noteId");
        if (typeof candidate === "string" && isValidUUID(candidate)) {
          setNoteId(candidate);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [ready, userId]);

  const choose = async (destination?: "note" | "canvas") => {
    if (!noteId || saving) return;
    setSaving(true);
    setError(false);
    try {
      const response = await fetch("/api/onboarding/welcome", {
        method: "POST",
      });
      if (!response.ok) throw new Error("welcome update failed");
      const target =
        destination === "note"
          ? `/notes/${noteId}`
          : destination === "canvas"
            ? "/settings#canvas"
            : null;
      setNoteId(null);
      if (target) router.push(target);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={noteId !== null}
      onClose={() => void choose()}
      className="relative z-[90]"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          aria-describedby={descriptionId}
          className="w-full max-w-md rounded-t-radius-lg border border-border-subtle bg-surface p-6 shadow-xl sm:rounded-radius-lg"
        >
          <DialogTitle className="font-serif text-2xl font-semibold text-text-primary">
            {t("Welcome to OghmaNotes")}
          </DialogTitle>
          <p id={descriptionId} className="mt-3 text-sm leading-6 text-text-secondary">
            {t("Your Getting Started note is ready. Open it to see your study workspace.")}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-error-300">
              {t("Could not save your choice. Try again.")}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              autoFocus
              disabled={saving}
              onClick={() => void choose("note")}
              className="min-h-11 rounded-radius-md bg-primary-600 px-4 text-sm font-medium text-text-on-primary transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-50"
            >
              {t("Open Getting Started")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void choose("canvas")}
              className="min-h-11 rounded-radius-md border border-border-subtle px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-50"
            >
              {t("Connect Canvas")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void choose()}
              className="min-h-11 rounded-radius-md px-4 text-sm text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 disabled:opacity-50"
            >
              {t("Skip")}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
