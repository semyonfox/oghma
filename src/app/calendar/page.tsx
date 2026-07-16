"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/20/solid";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useMediaQuery from "@/lib/hooks/use-media-query";
import useI18n from "@/lib/notes/hooks/use-i18n";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileDrawer from "@/components/navigation/mobile-drawer";
import MonthView from "@/components/calendar/month-view";
import WeekView from "@/components/calendar/week-view";
import AssignmentTracker from "@/components/assignments/assignment-tracker";

export default function CalendarPage() {
  const { t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const hasTaskSidebar = useMediaQuery("(min-width: 1024px)");
  const [tasksOpen, setTasksOpen] = useState(false);
  const {
    view,
    currentDate,
    setView,
    navigateForward,
    navigateBack,
    goToToday,
  } = useCalendarStore();
  const { setActiveNav } = useLayoutStore();

  useEffect(() => {
    setActiveNav("calendar");
  }, [setActiveNav]);

  const current = new Date(currentDate);
  const monthYear = current.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const weekLabel =
    view === "week"
      ? t("Week of {date}", {
          date: current.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        })
      : monthYear;

  return (
    <div className="flex h-dvh flex-col bg-app-page text-text">
      <MobileAppHeader title={t("Calendar")} />

      <div className="flex min-h-0 flex-1">
        {isDesktop === true && (
          <div className="w-12 shrink-0 overflow-hidden border-r border-border-subtle bg-background">
            <PrimaryNavigation />
          </div>
        )}

        <div className="flex min-w-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col" aria-label={t("Calendar")}>
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-2 py-2 sm:px-4 md:px-6 md:py-3">
              <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-secondary md:text-base">
                <time>{weekLabel}</time>
              </h1>

              <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
                <div className="relative flex items-center rounded-md glass-card">
                  <button
                    type="button"
                    onClick={navigateBack}
                    className="flex h-11 w-11 items-center justify-center rounded-l-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary md:h-8 md:w-9"
                    aria-label={t("Previous period")}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="hidden h-8 px-3 text-xs font-medium text-text-secondary hover:bg-subtle md:block"
                  >
                    {t("Today")}
                  </button>
                  <button
                    type="button"
                    onClick={navigateForward}
                    className="flex h-11 w-11 items-center justify-center rounded-r-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary md:h-8 md:w-9"
                    aria-label={t("Next period")}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTasksOpen(true)}
                  className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary glass-card hover:bg-subtle lg:hidden"
                  aria-label={t("Tasks")}
                >
                  <ClipboardDocumentListIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("Tasks")}</span>
                </button>

                <Menu as="div" className="relative">
                  <MenuButton className="flex h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-text-secondary glass-card hover:bg-subtle md:h-auto md:px-3 md:py-1.5">
                    <span>{view === "month" ? t("Month") : t("Week")}</span>
                    <ChevronDownIcon className="h-4 w-4 text-text-tertiary" />
                  </MenuButton>
                  <MenuItems className="absolute right-0 z-30 mt-1 w-36 rounded-md border border-border-subtle bg-surface py-1 shadow-xl">
                    <MenuItem>
                      <button
                        type="button"
                        onClick={() => setView("month")}
                        className="block min-h-11 w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-subtle data-[focus]:bg-subtle md:min-h-0"
                      >
                        {t("Month view")}
                      </button>
                    </MenuItem>
                    <MenuItem>
                      <button
                        type="button"
                        onClick={() => setView("week")}
                        className="block min-h-11 w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-subtle data-[focus]:bg-subtle md:min-h-0"
                      >
                        {t("Week view")}
                      </button>
                    </MenuItem>
                  </MenuItems>
                </Menu>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-hidden">
              {view === "month" ? <MonthView /> : <WeekView />}
            </div>
          </main>

          {hasTaskSidebar === true && (
            <aside className="flex w-[280px] shrink-0 flex-col glass-panel">
              <AssignmentTracker />
            </aside>
          )}
        </div>
      </div>

      {hasTaskSidebar === false && (
        <MobileDrawer
          open={tasksOpen}
          onClose={() => setTasksOpen(false)}
          title={t("Tasks")}
          side="right"
          keepMounted
          className="lg:hidden"
          panelClassName="w-[94vw] max-w-md"
        >
          <AssignmentTracker />
        </MobileDrawer>
      )}
    </div>
  );
}
