"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { ReactNode } from "react";
import useSwipeDismiss from "./use-swipe-dismiss";
import useMediaQuery from "@/lib/hooks/use-media-query";
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

// phones get a tall bottom sheet so dismissing never starts a sideways swipe
// near the screen edge, where android treats it as back. tablets keep the
// side drawer
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
  const wide = useMediaQuery("(min-width: 640px)") === true;
  const swipe = useSwipeDismiss({
    open,
    onClose,
    direction: wide ? side : "down",
    breakpoint: 1024,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      unmount={!keepMounted}
      className={clsx("fixed inset-0 z-[60]", className)}
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px] transition duration-200 data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 overflow-hidden">
        <div
          className={clsx(
            "absolute inset-x-0 bottom-0 flex sm:inset-x-auto sm:inset-y-0 sm:max-w-full",
            side === "left" ? "sm:left-0" : "sm:right-0",
          )}
        >
          <DialogPanel
            {...swipe}
            transition
            className={clsx(
              "flex h-[88dvh] w-full flex-col rounded-t-radius-2xl bg-sidebar pb-[var(--safe-bottom)] shadow-float ring-1 ring-border transition duration-200 ease-out data-closed:translate-y-full data-closed:opacity-0 motion-reduce:transition-none",
              "sm:h-dvh sm:w-[calc(100vw-1rem)] sm:max-w-sm sm:rounded-t-none sm:pt-[env(safe-area-inset-top)] sm:data-closed:translate-y-0",
              side === "left"
                ? "sm:rounded-r-2xl sm:data-closed:-translate-x-full"
                : "sm:rounded-l-2xl sm:data-closed:translate-x-full",
              panelClassName,
            )}
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden"
            />
            <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-1">
              <DialogTitle className="min-w-0 flex-1 truncate text-lg font-semibold text-text">
                {title}
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
