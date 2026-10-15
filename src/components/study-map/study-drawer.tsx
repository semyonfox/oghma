"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useSwipeDismiss from "@/components/navigation/use-swipe-dismiss";

const closeClass =
  "grid h-8 w-8 shrink-0 place-items-center rounded-radius-md text-text-tertiary hover:bg-primary-500/10 hover:text-text focus-visible:outline-2 focus-visible:outline-primary-500";

/**
 * the one sheet over the study map: docked to the right on large screens,
 * a swipeable bottom sheet otherwise
 */
export default function StudyDrawer({
  open,
  title,
  docked,
  wide = false,
  header = true,
  focusSelector = "[data-drawer-close]",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  docked: boolean;
  wide?: boolean;
  /** the inspector brings its own heading and close button */
  header?: boolean;
  focusSelector?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const swipe = useSwipeDismiss({ open: open && !docked, onClose });

  // a docked sheet is not modal, so it moves focus itself and hands it back on close
  useEffect(() => {
    if (!open || !docked) return;
    const previous = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(focusSelector)?.focus();
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (panel?.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        previous.focus();
    };
  }, [docked, focusSelector, open, title]);

  // the board and menus mark the Escape they handle, so this only closes the topmost surface
  useEffect(() => {
    if (!open || !docked) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      closeRef.current();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [docked, open]);

  const closeButton = (
    <button
      type="button"
      data-drawer-close
      className={closeClass}
      aria-label="Close panel"
      onClick={onClose}
    >
      <XMarkIcon className="h-5 w-5" aria-hidden="true" />
    </button>
  );

  if (docked)
    return open ? (
      <aside
        ref={panelRef}
        aria-label={title}
        className={`absolute bottom-16 right-3 top-16 z-50 flex flex-col overflow-hidden rounded-radius-xl border border-border-subtle bg-surface text-text shadow-xl ${wide ? "w-[min(640px,calc(100%-1.5rem))]" : "w-[min(440px,calc(100%-1.5rem))]"}`}
      >
        {header && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle py-2 pl-4 pr-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {title}
            </h2>
            {closeButton}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </aside>
    ) : null;

  return (
    <Dialog open={open} onClose={onClose} className="fixed inset-0 z-[70]">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
        <DialogPanel
          {...swipe}
          className={`flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-radius-xl border border-border-subtle bg-surface text-text sm:rounded-radius-xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
        >
          {header ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle py-2 pl-4 pr-2">
              <DialogTitle
                as="h2"
                className="min-w-0 flex-1 truncate text-sm font-semibold"
              >
                {title}
              </DialogTitle>
              {closeButton}
            </div>
          ) : (
            <DialogTitle className="sr-only">{title}</DialogTitle>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,var(--safe-bottom))]">
            {children}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

/** large screens dock the sheet beside the canvas; smaller ones get a bottom sheet */
export function useDockedSheet() {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDocked(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return docked;
}
