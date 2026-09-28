"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  ClockIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useGlobalSearchStore from "@/lib/global-search/state";
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import {
  useNativeAppBridge,
  supportsNativeOffline,
  postNativeOfflineOpen,
} from "@/lib/native-app";
import CanvasImportIndicator from "@/components/canvas/canvas-import-indicator";
import MobileSheet from "./mobile-sheet";

const destinations = [
  { href: "/notes", label: "Notes", icon: DocumentTextIcon },
  { href: "/chat", label: "AI Chat", icon: SparklesIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/quiz", label: "quiz.title", icon: AcademicCapIcon },
];

export default function MobileBottomNavigation({
  className = "",
  reserveSpace = false,
}: {
  className?: string;
  // keep the dock below fixed content, such as the chat composer, instead of floating over it
  reserveSpace?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const nativeBridge = useNativeAppBridge();
  const nativeDock = !!nativeBridge;
  const phase = usePomodoroStore((s) => s.phase);
  const [expanded, setExpanded] = useState(true);
  const dockRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const restingHeight = useRef(0);
  useEffect(() => {
    setMoreOpen(false);
    setExpanded(true);
    const offsets = new WeakMap<HTMLElement, number>();
    let travel = 0;
    let frame: number | undefined;
    let scrollTarget: HTMLElement | null = null;
    const updateFromScroll = () => {
      frame = undefined;
      const target = scrollTarget;
      if (!target) return;
      scrollTarget = null;
      const offset = Math.max(0, target.scrollTop);
      const delta = offset - (offsets.get(target) ?? 0);
      offsets.set(target, offset);
      if (offset <= 40 || delta < 0) {
        setExpanded(true);
        travel = 0;
      } else {
        travel += delta;
        if (travel >= 20) {
          setExpanded(false);
          travel = 0;
        }
      }
    };
    const onScroll = (event: Event) => {
      const pageScroll = event.target === document;
      const target = pageScroll ? document.scrollingElement : event.target;
      if (
        !(target instanceof HTMLElement) ||
        (!pageScroll && !dockRef.current?.parentElement?.contains(target)) ||
        (!pageScroll && target.closest('nav, [role="dialog"], textarea, input, [contenteditable="true"]'))
      ) return;
      scrollTarget = target;
      if (frame === undefined) frame = window.requestAnimationFrame(updateFromScroll);
    };
    // Workspace pages scroll inside panels rather than the document itself.
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);
  useEffect(() => {
    restingHeight.current = window.innerHeight;
    const update = () => {
      const target = document.activeElement;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("input,textarea") || target.isContentEditable);
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (!editing) restingHeight.current = window.innerHeight;
      setKeyboardOpen(editing && restingHeight.current - height > 120);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const moreActive =
    pathname?.startsWith("/settings") || pathname === "/notes/trash";
  const selectedStyle = nativeDock
    ? "bg-surface-elevated/35 text-primary-700 dark:text-primary-300"
    : "bg-surface-elevated/95 text-primary-700 dark:text-primary-300";
  const restingStyle = nativeDock
    ? "text-text-secondary hover:bg-surface-elevated/35 hover:text-text"
    : "text-text-secondary hover:bg-surface-elevated/95 hover:text-text";
  const rowClass =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-text-secondary hover:bg-subtle disabled:opacity-50";
  return (
    <>
      <div
        ref={dockRef}
        data-mobile-dock
        className={`${keyboardOpen ? "hidden" : "block"} pointer-events-none h-[var(--mobile-dock-space)] ${reserveSpace ? "relative shrink-0" : "fixed inset-x-0 bottom-0 z-30"} ${className}`}
      >
        <nav
          aria-label={t("Main navigation")}
          data-expanded={expanded}
          onFocusCapture={(event) => {
            if (event.target.matches(":focus-visible")) setExpanded(true);
          }}
          className={`pointer-events-auto absolute bottom-[calc(12px+var(--safe-bottom))] left-1/2 flex -translate-x-1/2 items-stretch overflow-hidden rounded-full ring-1 p-1 shadow-lg transition-[width,max-width,height] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${nativeDock ? "bg-surface/70 ring-border-subtle backdrop-blur-[8.75px]" : "bg-surface/90 ring-border-subtle"} ${expanded ? "h-16 w-[calc(100%-28px)] max-w-[420px]" : "h-[52px] w-[calc(100%-80px)] min-w-[228px] max-w-[350px]"}`}
        >
          {destinations.map(({ href, label, icon: Icon }) => {
            const active = !moreActive && pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                aria-label={t(label)}
                aria-current={active ? "page" : undefined}
                onClick={() => setExpanded(true)}
                className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-full text-xs font-semibold transition-[gap,background-color,color] duration-[280ms] motion-reduce:transition-none active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${expanded ? "gap-0.5" : "gap-0"} ${active ? selectedStyle : restingStyle}`}
              >
                <Icon className="h-[26px] w-[26px] shrink-0" aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className={`block max-w-full shrink-0 truncate transition-[max-height,opacity] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expanded ? "max-h-4 opacity-100" : "max-h-0 opacity-0"}`}
                >
                  {t(label)}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => { setExpanded(true); setMoreOpen(true); }}
            aria-label={t("More")}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-full text-xs font-semibold transition-[gap,background-color,color] duration-[280ms] motion-reduce:transition-none active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 ${expanded ? "gap-0.5" : "gap-0"} ${moreActive || moreOpen ? selectedStyle : restingStyle}`}
          >
            <EllipsisHorizontalIcon className="h-[26px] w-[26px] shrink-0" aria-hidden="true" />
            <span
              aria-hidden="true"
              className={`block max-w-full shrink-0 truncate transition-[max-height,opacity] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expanded ? "max-h-4 opacity-100" : "max-h-0 opacity-0"}`}
            >
              {t("More")}
            </span>
          </button>
        </nav>
      </div>
      <MobileSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t("More")}
      >
        <button
          type="button"
          className={rowClass}
          onClick={() => {
            setMoreOpen(false);
            useGlobalSearchStore.getState().open();
          }}
        >
          <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
          {t("Search OghmaNotes")}
        </button>
        <Link
          className={rowClass}
          href="/settings"
          onClick={() => setMoreOpen(false)}
        >
          <Cog6ToothIcon className="h-5 w-5" aria-hidden="true" />
          {t("Settings")}
        </Link>
        <button
          type="button"
          className={rowClass}
          disabled={phase !== "idle"}
          onClick={() => {
            setMoreOpen(false);
            void usePomodoroStore.getState().start({});
          }}
        >
          <ClockIcon className="h-5 w-5" aria-hidden="true" />
          {t(phase === "idle" ? "Focus" : "Focus session in progress")}
        </button>
        {nativeBridge && supportsNativeOffline() && (
          <button
            type="button"
            className={rowClass}
            onClick={() => {
              setMoreOpen(false);
              postNativeOfflineOpen();
            }}
          >
            <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
            {t("Offline notes")}
          </button>
        )}
        <Link
          className={rowClass}
          href="/notes/trash"
          onClick={() => setMoreOpen(false)}
        >
          <TrashIcon className="h-5 w-5" aria-hidden="true" />
          {t("Trash")}
        </Link>
        <CanvasImportIndicator />
      </MobileSheet>
    </>
  );
}
