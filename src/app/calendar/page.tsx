'use client';

import { useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import useCalendarStore from '@/lib/notes/state/calendar.zustand';
import useAssignmentStore from '@/lib/notes/state/assignments.zustand';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import useI18n from '@/lib/notes/hooks/use-i18n';
import IconNav from '@/components/sidebar/icon-nav';
import MonthView from '@/components/calendar/month-view';
import WeekView from '@/components/calendar/week-view';
import AssignmentTracker from '@/components/panels/assignment-tracker';

export default function CalendarPage() {
  const { t } = useI18n();
  const { view, currentDate, setView, navigateForward, navigateBack, goToToday } = useCalendarStore();
  const { fetchAssignments } = useAssignmentStore();
  const { setActiveNav } = useLayoutStore();

  useEffect(() => {
    setActiveNav('calendar');
    fetchAssignments();
  }, [setActiveNav, fetchAssignments]);

  const current = new Date(currentDate);
  const monthYear = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekLabel = view === 'week'
    ? `Week of ${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : monthYear;

  return (
    <div className="flex h-screen bg-background text-text">
      <IconNav />

      <div className="flex flex-1 min-w-0">
        {/* main calendar area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* header */}
          <header className="flex items-center justify-between border-b border-border-subtle px-6 py-3 shrink-0">
            <h1 className="text-base font-semibold text-text-secondary">
              <time>{weekLabel}</time>
            </h1>
            <div className="flex items-center gap-3">
              {/* prev/today/next */}
              <div className="relative flex items-center rounded-md bg-white/5 border border-border-subtle">
                <button
                  onClick={navigateBack}
                  className="flex h-8 w-9 items-center justify-center rounded-l-md text-text-tertiary hover:text-text-secondary hover:bg-white/5"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={goToToday}
                  className="hidden md:block px-3 text-xs font-medium text-text-secondary hover:bg-white/5"
                >
                  {t('Today')}
                </button>
                <button
                  onClick={navigateForward}
                  className="flex h-8 w-9 items-center justify-center rounded-r-md text-text-tertiary hover:text-text-secondary hover:bg-white/5"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              {/* view switcher */}
              <Menu as="div" className="relative">
                <MenuButton className="flex items-center gap-1.5 rounded-md bg-white/5 border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/8">
                  {view === 'month' ? t('Month') : t('Week')}
                  <ChevronDownIcon className="h-4 w-4 text-text-tertiary" />
                </MenuButton>
                <MenuItems className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-border-subtle bg-surface shadow-lg py-1">
                  <MenuItem>
                    <button
                      onClick={() => setView('month')}
                      className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 data-[focus]:bg-white/5"
                    >
                      {t('Month view')}
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button
                      onClick={() => setView('week')}
                      className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 data-[focus]:bg-white/5"
                    >
                      {t('Week view')}
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </header>

          {/* calendar body */}
          <div className="flex-1 overflow-hidden">
            {view === 'month' ? <MonthView /> : <WeekView />}
          </div>
        </div>

        {/* right sidebar — assignment tracker */}
        <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-border-subtle bg-surface">
          <AssignmentTracker />
        </div>
      </div>
    </div>
  );
}
