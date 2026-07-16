"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { ReactNode } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "left" | "right";
  keepMounted?: boolean;
  className?: string;
  panelClassName?: string;
}

export default function MobileDrawer({
  open,
  onClose,
  title,
  children,
  side = "left",
  keepMounted = false,
  className,
  panelClassName,
}: MobileDrawerProps) {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      unmount={!keepMounted}
      className={clsx("fixed inset-0 z-[60]", className)}
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px] transition duration-200 data-closed:opacity-0"
      />
      <div className="fixed inset-0 overflow-hidden">
        <div
          className={clsx(
            "absolute inset-y-0 flex max-w-full",
            side === "left" ? "left-0" : "right-0",
          )}
        >
          <DialogPanel
            transition
            className={clsx(
              "flex h-dvh w-[90vw] max-w-sm flex-col bg-background shadow-2xl ring-1 ring-border-subtle transition duration-200 ease-out data-closed:opacity-0",
              side === "left"
                ? "data-closed:-translate-x-full"
                : "data-closed:translate-x-full",
              panelClassName,
            )}
          >
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-3">
              <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold text-text-secondary">
                {title}
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                aria-label={t("Close")}
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
