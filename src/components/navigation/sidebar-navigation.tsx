"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownTrayIcon, ClockIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import BrandLogo from "@/components/brand-logo";
import CanvasImportIndicator from "@/components/canvas/canvas-import-indicator";
import useI18n from "@/lib/notes/hooks/use-i18n";
import usePomodoroStore from "@/lib/notes/state/pomodoro";
import { postNativeOfflineOpen } from "@/lib/native-app";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav-items";
import useSidebarSummary from "./use-sidebar-summary";

interface SidebarNavigationProps {
  activeSection: NavItem["section"];
  homeHref: string;
  onNavClick: (item: NavItem) => void;
  onFocusClick: () => void;
  focusActive: boolean;
  focusStarting: boolean;
  focusTitle: string;
  offlineAvailable: boolean;
  children?: ReactNode;
}

const ROW =
  "flex h-9 w-full items-center gap-2.5 rounded-radius-md px-2.5 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
const ROW_ACTIVE = "atlas-raised font-medium text-text";
const ROW_IDLE = "text-text-secondary hover:bg-subtle hover:text-text";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// desktop shell from the Atlas mockups: labelled nav, the page's own section,
// then Canvas import status and the signed-in account
export default function SidebarNavigation({
  activeSection,
  homeHref,
  onNavClick,
  onFocusClick,
  focusActive,
  focusStarting,
  focusTitle,
  offlineAvailable,
  children,
}: SidebarNavigationProps) {
  const { t } = useI18n();
  const secondsRemaining = usePomodoroStore((state) => state.secondsRemaining);
  const { name, email, avatarUrl, dueCount } = useSidebarSummary();
  const accountLabel = name || email;
  const settingsActive = activeSection === "settings";

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col gap-4 bg-sidebar px-3 pb-3 pt-4"
    >
      <Link
        href={homeHref}
        className="desktop-navigation-rail flex items-center gap-2.5 rounded-radius-md px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <BrandLogo size={26} className="h-[26px] w-[26px]" />
        <span className="font-serif text-[17px] font-bold text-text">{t("OghmaNotes")}</span>
      </Link>

      <nav aria-label={t("Main navigation")} className="desktop-navigation-rail flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.section;
          const className = `${ROW} ${isActive ? ROW_ACTIVE : ROW_IDLE}`;
          const content = (
            <>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {item.section === "search" ? t("Search") : t(item.labelKey)}
              </span>
              {item.section === "search" && (
                <kbd aria-hidden="true" className="rounded-[5px] border border-border px-1.5 font-mono text-[11px] text-text-tertiary">
                  ⌘K
                </kbd>
              )}
              {item.section === "quiz" && dueCount !== null && dueCount > 0 && (
                <span className="rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent-soft-text">
                  {t("{count} due", { count: dueCount })}
                </span>
              )}
            </>
          );
          if (item.section === "search") {
            return (
              <button key={item.id} type="button" onClick={() => onNavClick(item)} className={className}>
                {content}
              </button>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => onNavClick(item)}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onFocusClick}
          disabled={focusActive || focusStarting}
          aria-pressed={focusActive}
          aria-busy={focusStarting}
          title={focusStarting ? t("Loading...") : focusTitle}
          className={`${ROW} ${focusActive ? ROW_ACTIVE : ROW_IDLE}`}
        >
          <ClockIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">{t("Focus")}</span>
          {focusActive && (
            <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
              {formatClock(secondsRemaining)}
            </span>
          )}
        </button>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <div className="desktop-navigation-rail flex flex-col gap-2">
        {offlineAvailable && (
          <button
            type="button"
            onClick={() => postNativeOfflineOpen()}
            className={`${ROW} ${ROW_IDLE} text-sm`}
          >
            <ArrowDownTrayIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span>{t("Offline notes")}</span>
          </button>
        )}
        <CanvasImportIndicator variant="drawer" />
        <Link
          href={SETTINGS_ITEM.href}
          onClick={() => onNavClick(SETTINGS_ITEM)}
          aria-current={settingsActive ? "page" : undefined}
          aria-label={t("Settings")}
          className={`flex items-center gap-2.5 rounded-radius-lg px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${settingsActive ? "atlas-raised" : "hover:bg-subtle"}`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-sm font-semibold text-on-action">
              {(accountLabel ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-text">{accountLabel ?? t("Settings")}</span>
            {name && email && <span className="truncate text-xs text-text-tertiary">{email}</span>}
          </span>
          <Cog6ToothIcon className="h-[18px] w-[18px] shrink-0 text-text-tertiary" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
