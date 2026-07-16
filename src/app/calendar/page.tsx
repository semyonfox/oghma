"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
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
import MobileDayAgenda from "@/components/calendar/mobile-day-agenda";
import DayAgendaDialog from "@/components/calendar/day-agenda-dialog";
import StudyBlockDialog from "@/components/calendar/study-block-dialog";
import useAssignmentStore from "@/lib/notes/state/assignments.zustand";
import {
  addDaysToDateKey,
  formatDateKey,
  localDateKeyRangeToIso,
} from "@/lib/notes/utils/calendar-date";

export default function CalendarPage() {
  const { activeLocale, t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const hasTaskSidebar = useMediaQuery("(min-width: 1024px)");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
  const [studyBlockOpen, setStudyBlockOpen] = useState(false);
  const [studyBlockStart, setStudyBlockStart] = useState<string>();
  const [studyBlockEnd, setStudyBlockEnd] = useState<string>();
  const {
    view,
    currentDate,
    setView,
    navigateForward,
    navigateBack,
    goToToday,
    selectedDate,
    fetchTimeBlocks,
    fetchReviewDates,
  } = useCalendarStore();
  const fetchAssignments = useAssignmentStore((state) => state.fetchAssignments);
  const { setActiveNav } = useLayoutStore();

  useEffect(() => {
    setActiveNav("calendar");
  }, [setActiveNav]);

  useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  useEffect(() => {
    const anchor = new Date(currentDate);
    let startDateKey: string;
    let endDateKey: string;
    if (isDesktop === false) {
      startDateKey = addDaysToDateKey(selectedDate, -7);
      endDateKey = addDaysToDateKey(selectedDate, 7);
    } else if (view === "month") {
      startDateKey = formatDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), -6));
      endDateKey = formatDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 7));
    } else {
      const monday = new Date(anchor);
      monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      startDateKey = formatDateKey(monday);
      endDateKey = addDaysToDateKey(startDateKey, 6);
    }
    const range = localDateKeyRangeToIso(startDateKey, endDateKey);
    void fetchTimeBlocks(range.start, range.end);
    void fetchReviewDates(startDateKey, endDateKey);
  }, [currentDate, fetchReviewDates, fetchTimeBlocks, isDesktop, selectedDate, view]);

  useEffect(() => {
    const refresh = () => {
      const range = localDateKeyRangeToIso(
        addDaysToDateKey(selectedDate, -7),
        addDaysToDateKey(selectedDate, 7),
      );
      void fetchTimeBlocks(range.start, range.end);
    };
    window.addEventListener("oghma:time-block-changed", refresh);
    return () => window.removeEventListener("oghma:time-block-changed", refresh);
  }, [fetchTimeBlocks, selectedDate]);

  const current = new Date(currentDate);
  const monthYear = current.toLocaleDateString(activeLocale, {
    month: "long",
    year: "numeric",
  });
  const weekLabel =
    view === "week"
      ? t("Week of {date}", {
          date: current.toLocaleDateString(activeLocale, {
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
            <header className="glass-panel relative z-50 hidden h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 md:flex">
              <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-secondary md:text-base">
                <time>{weekLabel}</time>
              </h1>

              <div className="flex shrink-0 items-center gap-2">
                <div className="relative flex h-8 items-center overflow-hidden rounded-radius-md glass-card">
                  <button
                    type="button"
                    onClick={navigateBack}
                    className="flex h-8 w-8 items-center justify-center text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/50"
                    aria-label={t("Previous period")}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="hidden h-8 px-3 text-xs font-medium text-text-secondary hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/50 md:block"
                  >
                    {t("Today")}
                  </button>
                  <button
                    type="button"
                    onClick={navigateForward}
                    className="flex h-8 w-8 items-center justify-center text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400/50"
                    aria-label={t("Next period")}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTasksOpen(true)}
                  className="flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-radius-md px-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 lg:hidden"
                  aria-label={t("Tasks")}
                >
                  <ClipboardDocumentListIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("Tasks")}</span>
                </button>

                <Menu as="div" className="relative z-[60]">
                  <MenuButton className="flex h-8 min-w-24 items-center justify-between gap-2 rounded-radius-md px-3 text-xs font-medium text-text-secondary glass-card-interactive outline-none focus:outline-none data-[focus]:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50">
                    <span>{view === "month" ? t("Month") : t("Week")}</span>
                    <ChevronDownIcon className="h-4 w-4 text-text-tertiary" />
                  </MenuButton>
                  <MenuItems className="absolute right-0 z-[90] mt-1 w-40 overflow-hidden rounded-radius-md border border-border bg-app-page py-1 shadow-2xl ring-1 ring-black/20 focus:outline-none">
                    <MenuItem>
                      <button
                        type="button"
                        onClick={() => setView("month")}
                        className="flex h-9 w-full items-center justify-between gap-2 bg-app-page px-3 text-left text-xs text-text-secondary hover:bg-subtle focus:outline-none data-[focus]:bg-subtle"
                      >
                        {t("Month view")}
                        {view === "month" && (
                          <CheckIcon className="h-4 w-4 shrink-0 text-primary-400" />
                        )}
                      </button>
                    </MenuItem>
                    <MenuItem>
                      <button
                        type="button"
                        onClick={() => setView("week")}
                        className="flex h-9 w-full items-center justify-between gap-2 bg-app-page px-3 text-left text-xs text-text-secondary hover:bg-subtle focus:outline-none data-[focus]:bg-subtle"
                      >
                        {t("Week view")}
                        {view === "week" && (
                          <CheckIcon className="h-4 w-4 shrink-0 text-primary-400" />
                        )}
                      </button>
                    </MenuItem>
                  </MenuItems>
                </Menu>
              </div>
            </header>

            {isDesktop === false && (
              <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1.5">
                <button type="button" onClick={navigateBack} className="flex h-11 w-11 items-center justify-center rounded-md glass-card" aria-label={t("Previous period")}><ChevronLeftIcon className="h-4 w-4" /></button>
                <button type="button" onClick={goToToday} className="h-11 rounded-md px-3 text-xs font-medium glass-card">{t("Today")}</button>
                <button type="button" onClick={navigateForward} className="flex h-11 w-11 items-center justify-center rounded-md glass-card" aria-label={t("Next period")}><ChevronRightIcon className="h-4 w-4" /></button>
                <div className="flex-1" />
                <button type="button" onClick={() => setTasksOpen(true)} className="h-11 rounded-md px-3 text-xs font-medium glass-card">{t("Tasks")}</button>
                <button type="button" onClick={() => { setStudyBlockStart(undefined); setStudyBlockEnd(undefined); setStudyBlockOpen(true); }} className="h-11 rounded-md bg-primary-600 px-3 text-xs font-medium text-text-on-primary">{t("Add study block")}</button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              {isDesktop === false ? (
                <MobileDayAgenda
                  onAddStudyBlock={() => setStudyBlockOpen(true)}
                  onRetry={() => {
                    void fetchAssignments();
                    const range = localDateKeyRangeToIso(selectedDate, selectedDate);
                    void fetchTimeBlocks(range.start, range.end);
                    void fetchReviewDates(selectedDate, selectedDate);
                  }}
                />
              ) : view === "month" ? (
                <MonthView onSelectDate={() => setDayDetailsOpen(true)} />
              ) : (
                <WeekView
                  onSelectDate={() => setDayDetailsOpen(true)}
                  onAddStudyBlock={(_date, start, end) => {
                    setStudyBlockStart(start);
                    setStudyBlockEnd(end);
                    setStudyBlockOpen(true);
                  }}
                />
              )}
            </div>
          </main>

          {hasTaskSidebar === true && (
            <aside className="flex w-[280px] shrink-0 flex-col border-l border-border-subtle glass-panel">
              <div className="flex h-12 shrink-0 items-center border-b border-border-subtle px-3">
                <h2 className="text-sm font-semibold text-text-secondary">{t("Tasks")}</h2>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <AssignmentTracker surface="compact" />
              </div>
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
          <AssignmentTracker surface="full" />
        </MobileDrawer>
      )}

      <DayAgendaDialog
        open={dayDetailsOpen}
        onClose={() => setDayDetailsOpen(false)}
        dateKey={selectedDate}
        onAddStudyBlock={() => setStudyBlockOpen(true)}
        onRetry={() => {
          const range = localDateKeyRangeToIso(selectedDate, selectedDate);
          void fetchTimeBlocks(range.start, range.end);
          void fetchReviewDates(selectedDate, selectedDate);
        }}
      />
      <StudyBlockDialog
        open={studyBlockOpen}
        onClose={() => setStudyBlockOpen(false)}
        initialDate={selectedDate}
        initialStart={studyBlockStart}
        initialEnd={studyBlockEnd}
      />
    </div>
  );
}
