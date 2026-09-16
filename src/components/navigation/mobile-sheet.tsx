"use client";

import { type ReactNode } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function MobileSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} className="relative z-[70]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 transition-opacity duration-150 data-[closed]:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          transition
          className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] text-text shadow-xl transition duration-150 data-[closed]:translate-y-4 data-[closed]:opacity-0 motion-reduce:transition-none sm:rounded-2xl"
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-border sm:hidden"
          />
          <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
            <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold">
              {title}
            </DialogTitle>
            <button
              type="button"
              className="ui-icon-button"
              onClick={onClose}
              aria-label={t("Close")}
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
            {children}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
