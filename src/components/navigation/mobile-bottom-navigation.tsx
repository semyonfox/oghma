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

export default function MobileBottomNavigation() {
  const { t } = useI18n();
  const pathname = usePathname();
  const nativeBridge = useNativeAppBridge();
  const phase = usePomodoroStore((s) => s.phase);
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const restingHeight = useRef(0);
  useEffect(() => setMoreOpen(false), [pathname]);
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
  const rowClass =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-text-secondary hover:bg-subtle disabled:opacity-50";
  return (
    <>
      <nav
        aria-label={t("Main navigation")}
        className={`${keyboardOpen ? "hidden" : "flex"} shrink-0 items-start border-t border-border-subtle bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 lg:hidden`}
      >
        {destinations.map(({ href, label, icon: Icon }) => {
          const active = !moreActive && pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg text-xs font-medium ${active ? "text-primary-700 dark:text-primary-300" : "text-text-secondary hover:text-text"}`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-primary-500/10" : ""}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="max-w-full truncate">{t(label)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex min-h-12 min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg text-xs font-medium ${moreActive || moreOpen ? "text-primary-700 dark:text-primary-300" : "text-text-secondary hover:text-text"}`}
        >
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive || moreOpen ? "bg-primary-500/10" : ""}`}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>{t("More")}</span>
        </button>
      </nav>
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
