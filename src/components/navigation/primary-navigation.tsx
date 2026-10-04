"use client";

import { FC, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useGlobalSearchStore from "@/lib/global-search/state";
import usePomodoroStore from "@/lib/notes/state/pomodoro.zustand";
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  SparklesIcon,
  Cog6ToothIcon,
  AcademicCapIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

interface NavItem {
  id: string;
  labelKey: string;
  icon: FC<{ className?: string }>;
  href: string;
  section: "notes" | "search" | "calendar" | "settings" | "chat" | "quiz";
}

interface PrimaryNavigationProps {
  variant?: "rail" | "drawer";
  onNavigate?: () => void;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "notes",
    labelKey: "Notes",
    icon: DocumentTextIcon,
    href: "/notes",
    section: "notes",
  },
  {
    id: "search",
    labelKey: "Search",
    icon: MagnifyingGlassIcon,
    href: "/notes",
    section: "search",
  },
  {
    id: "calendar",
    labelKey: "Calendar",
    icon: CalendarIcon,
    href: "/calendar",
    section: "calendar",
  },
  {
    id: "chat",
    labelKey: "AI Chat",
    icon: SparklesIcon,
    href: "/chat",
    section: "chat",
  },
  {
    id: "quiz",
    labelKey: "Quiz",
    icon: AcademicCapIcon,
    href: "/quiz",
    section: "quiz",
  },
];

const SETTINGS_ITEM: NavItem = {
  id: "settings",
  labelKey: "Settings",
  icon: Cog6ToothIcon,
  href: "/settings",
  section: "settings",
};

const PrimaryNavigation: FC<PrimaryNavigationProps> = ({
  variant = "rail",
  onNavigate,
}) => {
  const pathname = usePathname();
  const activeNav = useLayoutStore((state) => state.activeNav);
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);
  const { t } = useI18n();
  const pomodoroPhase = usePomodoroStore((state) => state.phase);
  const startPomodoro = usePomodoroStore((state) => state.start);

  const focusStartPending = useRef(false);
  const [focusStarting, setFocusStarting] = useState(false);
  const focusActive = pomodoroPhase !== "idle";
  const focusLabel = t("Focus");
  const focusTitle = focusActive ? t("Focus session in progress") : focusLabel;

  const handleFocusClick = async () => {
    if (focusActive || focusStartPending.current) return;
    focusStartPending.current = true;
    setFocusStarting(true);
    try {
      await startPomodoro({});
      onNavigate?.();
    } finally {
      focusStartPending.current = false;
      setFocusStarting(false);
    }
  };

  const derivedActiveSection: NavItem["section"] = pathname?.startsWith(
    "/settings",
  )
    ? "settings"
    : pathname?.startsWith("/quiz")
      ? "quiz"
      : pathname?.startsWith("/calendar")
        ? "calendar"
        : pathname?.startsWith("/chat")
          ? "chat"
          : pathname?.startsWith("/notes")
            ? "notes"
            : activeNav;

  const handleNavClick = (item: NavItem) => {
    onNavigate?.();

    if (item.section === "search") {
      useGlobalSearchStore.getState().open();
      return;
    }

    setActiveNav(item.section);
  };

  if (variant === "drawer") {
    return (
      <nav
        className="flex h-full flex-col overflow-y-auto p-3"
        aria-label={t("Main navigation")}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className="mb-3 flex min-h-11 items-center gap-3 rounded-radius-md px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-subtle"
        >
          <BrandLogo size={24} className="h-6 w-6" />
          <span>{t("OghmaNotes")}</span>
        </Link>

        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const IconComp = item.icon;
            const isActive = derivedActiveSection === item.section;
            const translatedLabel = t(item.labelKey);

            const content = (
              <>
                <IconComp className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{translatedLabel}</span>
              </>
            );
            const className = `flex min-h-11 w-full items-center gap-3 rounded-radius-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${isActive ? "bg-primary-500/10 text-primary-400" : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"}`;
            if (item.section !== "search") {
              return (
                <Link key={item.id} href={item.href}
                  onClick={() => handleNavClick(item)}
                  aria-current={isActive ? "page" : undefined}
                  className={className}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                aria-label={translatedLabel}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-radius-md px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary-500/10 text-primary-400"
                    : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
                }`}
                title={translatedLabel}
              >
                <IconComp className="h-5 w-5 shrink-0" />
                <span>{translatedLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleFocusClick}
            disabled={focusActive || focusStarting}
            aria-label={focusLabel}
            aria-pressed={focusActive}
            aria-busy={focusStarting}
            className={`flex min-h-11 w-full items-center gap-3 rounded-radius-md px-3 text-sm font-medium transition-colors ${
              focusActive
                ? "bg-primary-500/10 text-primary-400"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={focusStarting ? t("Loading...") : focusTitle}
          >
            <ClockIcon className="h-5 w-5 shrink-0" />
            <span>{focusLabel}</span>
          </button>
        </div>

        <div className="mt-auto border-t border-border-subtle pt-3">
          <Link
            href={SETTINGS_ITEM.href}
            onClick={() => handleNavClick(SETTINGS_ITEM)}
            aria-label={t("Settings")}
            aria-current={
              derivedActiveSection === "settings" ? "page" : undefined
            }
            className={`flex min-h-11 w-full items-center gap-3 rounded-radius-md px-3 text-sm font-medium transition-colors ${
              derivedActiveSection === "settings"
                ? "bg-primary-500/10 text-primary-400"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={t("Settings")}
          >
            <Cog6ToothIcon className="h-5 w-5 shrink-0" />
            <span>{t("Settings")}</span>
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="flex h-full w-14 shrink-0 flex-col items-center gap-2 pb-2 pt-4"
      aria-label={t("Main navigation")}
    >
      <Link
        href="/"
        className="mb-4 flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center transition-opacity hover:opacity-70"
      >
        <BrandLogo size={24} alt="OghmaNotes Logo" className="h-6 w-6" />
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = derivedActiveSection === item.section;
          const translatedLabel = t(item.labelKey);

          const className = `group relative flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-radius-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${isActive ? "bg-primary-500/10 text-primary-400" : "text-text-tertiary hover:bg-subtle hover:text-text"}`;
          if (item.section !== "search") {
            return (
              <Link key={item.id} href={item.href}
                onClick={() => handleNavClick(item)}
                aria-label={translatedLabel}
                aria-current={isActive ? "page" : undefined}
                title={translatedLabel} className={className}>
                <IconComp className="h-5 w-5" aria-hidden="true" />
                <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {translatedLabel}
                </span>
              </Link>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              aria-label={translatedLabel}
              aria-current={isActive ? "page" : undefined}
              aria-describedby={`tooltip-${item.id}`}
              className={`group relative flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-radius-md transition-colors ${
                isActive
                  ? "bg-primary-500/10 text-primary-400"
                  : "text-text-tertiary hover:bg-subtle hover:text-text"
              }`}
              title={translatedLabel}
            >
              <IconComp className="h-5 w-5" />
              <div
                id={`tooltip-${item.id}`}
                role="tooltip"
                className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {translatedLabel}
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleFocusClick}
          disabled={focusActive || focusStarting}
          aria-label={focusLabel}
          aria-pressed={focusActive}
            aria-busy={focusStarting}
          aria-describedby="tooltip-focus"
          className={`group relative flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-radius-md transition-colors ${
            focusActive
              ? "bg-primary-500/10 text-primary-400"
              : "text-text-tertiary hover:bg-subtle hover:text-text"
          }`}
          title={focusStarting ? t("Loading...") : focusTitle}
        >
          <ClockIcon className="h-5 w-5" />
          <div
            id="tooltip-focus"
            role="tooltip"
            className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {focusTitle}
          </div>
        </button>
      </div>

      <Link
        href={SETTINGS_ITEM.href}
        onClick={() => handleNavClick(SETTINGS_ITEM)}
        aria-describedby="tooltip-settings"
        aria-label={t("Settings")}
        aria-current={derivedActiveSection === "settings" ? "page" : undefined}
        className={`group relative flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-radius-md transition-colors ${
          derivedActiveSection === "settings"
            ? "bg-primary-500/10 text-primary-400"
            : "text-text-tertiary hover:bg-subtle hover:text-text"
        }`}
        title={t("Settings")}
      >
        <Cog6ToothIcon className="h-5 w-5" />
        <div
          id="tooltip-settings"
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {t("Settings")}
        </div>
      </Link>
    </nav>
  );
};

export default PrimaryNavigation;
