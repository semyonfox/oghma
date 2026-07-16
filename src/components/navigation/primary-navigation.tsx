"use client";

import { FC } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = useLayoutStore((state) => state.activeNav);
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);
  const rightPanelOpen = useLayoutStore((state) => state.rightPanelOpen);
  const rightPanelTab = useLayoutStore((state) => state.rightPanelTab);
  const { t } = useI18n();
  const pomodoroPhase = usePomodoroStore((state) => state.phase);
  const startPomodoro = usePomodoroStore((state) => state.start);

  const focusActive = pomodoroPhase !== "idle";
  const focusLabel = t("Focus");
  const focusTitle = focusActive ? t("Focus session in progress") : focusLabel;

  const handleFocusClick = () => {
    if (focusActive) return;
    onNavigate?.();
    void startPomodoro({});
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
          : pathname?.startsWith("/notes") &&
              rightPanelOpen &&
              rightPanelTab === "ai"
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
    if (item.section === "chat") {
      router.push("/chat");
      return;
    }
    if (pathname !== item.href) {
      router.push(item.href);
    }
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
          <img src="/oghmanotes.svg" alt="" className="h-6 w-6" />
          <span>{t("OghmaNotes")}</span>
        </Link>

        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const IconComp = item.icon;
            const isActive = derivedActiveSection === item.section;
            const translatedLabel = t(item.labelKey);

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
            disabled={focusActive}
            aria-label={focusLabel}
            aria-pressed={focusActive}
            className={`flex min-h-11 w-full items-center gap-3 rounded-radius-md px-3 text-sm font-medium transition-colors ${
              focusActive
                ? "bg-primary-500/10 text-primary-400"
                : "text-text-tertiary hover:bg-subtle hover:text-text-secondary"
            }`}
            title={focusTitle}
          >
            <ClockIcon className="h-5 w-5 shrink-0" />
            <span>{focusLabel}</span>
          </button>
        </div>

        <div className="mt-auto border-t border-border-subtle pt-3">
          <button
            type="button"
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
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="flex h-full w-12 shrink-0 flex-col items-center gap-2 py-4"
      aria-label={t("Main navigation")}
    >
      <Link
        href="/"
        className="mb-4 flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center transition-opacity hover:opacity-70"
      >
        <img src="/oghmanotes.svg" alt="OghmaNotes Logo" className="h-6 w-6" />
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = derivedActiveSection === item.section;
          const translatedLabel = t(item.labelKey);

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
                className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
              >
                {translatedLabel}
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleFocusClick}
          disabled={focusActive}
          aria-label={focusLabel}
          aria-pressed={focusActive}
          aria-describedby="tooltip-focus"
          className={`group relative flex h-10 min-h-[44px] w-10 min-w-[44px] items-center justify-center rounded-radius-md transition-colors ${
            focusActive
              ? "bg-primary-500/10 text-primary-400"
              : "text-text-tertiary hover:bg-subtle hover:text-text"
          }`}
          title={focusTitle}
        >
          <ClockIcon className="h-5 w-5" />
          <div
            id="tooltip-focus"
            role="tooltip"
            className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
          >
            {focusTitle}
          </div>
        </button>
      </div>

      <div className="my-2 h-px w-8 bg-border" />

      <button
        type="button"
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
          className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
        >
          {t("Settings")}
        </div>
      </button>
    </nav>
  );
};

export default PrimaryNavigation;
