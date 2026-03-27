"use client";

import { useEffect } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import useCalendarStore from "@/lib/notes/state/calendar.zustand";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import IconNav from "@/components/sidebar/icon-nav";
import MonthView from "@/components/calendar/month-view";
import WeekView from "@/components/calendar/week-view";
import AssignmentTracker from "@/components/panels/assignment-tracker";

export default function CalendarPage() {
  const { t } = useI18n();
  const {
    view,
    currentDate,
    setView,
    navigateForward,
    navigateBack,
    goToToday,
  } = useCalendarStore();
  const { fetchAssignments } = useAssignmentStore();
  const { setActiveNav } = useLayoutStore();

  useEffect(() => {
    setActiveNav("calendar");
    fetchAssignments();
  }, [setActiveNav, fetchAssignments]);

  const current = new Date(currentDate);
  const monthYear = current.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const weekLabel =
    view === "week"
      ? `Week of ${current.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : monthYear;

  return (
    <div className="flex h-screen bg-background text-text">
      <IconNav />

      <div className="flex flex-1 min-w-0">
        {/* main calendar area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* header */}
          <header className="flex items-center justify-between border-b border-border-subtle bg-surface/50 backdrop-blur-sm px-6 py-3.5 shrink-0">
            <h1 className="text-sm font-semibold tracking-tight text-text">
              <time>{weekLabel}</time>
            </h1>
            <div className="flex items-center gap-2">
              {/* prev/today/next */}
              <div className="relative flex items-center rounded-lg border border-border-subtle overflow-hidden">
                <button
                  onClick={navigateBack}
                  className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface transition-colors"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="w-px h-4 bg-border-subtle" />
                <button
                  onClick={goToToday}
                  className="hidden md:block px-3 h-8 text-xs font-medium text-text-secondary hover:bg-surface transition-colors"
                >
                  {t("Today")}
                </button>
                <span className="hidden md:block w-px h-4 bg-border-subtle" />
                <button
                  onClick={navigateForward}
                  className="flex h-8 w-8 items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface transition-colors"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              {/* view switcher */}
              <Menu as="div" className="relative">
                <MenuButton className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface hover:text-text transition-colors">
                  {view === "month" ? t("Month") : t("Week")}
                  <ChevronDownIcon className="h-3.5 w-3.5 text-text-tertiary" />
                </MenuButton>
                <MenuItems className="absolute right-0 z-10 mt-1.5 w-36 rounded-lg border border-border-subtle bg-surface shadow-xl shadow-black/20 py-1">
                  <MenuItem>
                    <button
                      onClick={() => setView("month")}
                      className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-primary-500/10 hover:text-text data-[focus]:bg-primary-500/10 data-[focus]:text-text transition-colors"
                    >
                      {t("Month view")}
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button
                      onClick={() => setView("week")}
                      className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-primary-500/10 hover:text-text data-[focus]:bg-primary-500/10 data-[focus]:text-text transition-colors"
                    >
                      {t("Week view")}
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </header>

          {/* calendar body */}
          <div className="flex-1 overflow-hidden">
            {view === "month" ? <MonthView /> : <WeekView />}
          </div>
        </div>

        {/* right sidebar — assignment tracker */}
        <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-border-subtle bg-background">
          <AssignmentTracker />
        </div>
      </div>
    </div>
  );
}
