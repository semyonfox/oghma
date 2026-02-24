'use client';

import { FC } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  id: string;
  label: string;
  icon: FC<{ className?: string }>;
  href: string;
  section: 'notes' | 'search' | 'calendar' | 'quiz' | 'flashcards' | 'analytics' | 'settings';
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'notes',
    label: 'Notes',
    icon: DocumentTextIcon,
    href: '/notes',
    section: 'notes',
  },
  {
    id: 'search',
    label: 'Search',
    icon: MagnifyingGlassIcon,
    href: '/search',
    section: 'search',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarIcon,
    href: '/calendar',
    section: 'calendar',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: QuestionMarkCircleIcon,
    href: '/quiz',
    section: 'quiz',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: SparklesIcon,
    href: '/flashcards',
    section: 'flashcards',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: ChartBarIcon,
    href: '/analytics',
    section: 'analytics',
  },
];

/**
 * Icon-only navigation sidebar (56px fixed width)
 * VSCode-style left navigation with hover tooltips
 */
const IconNav: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, setActiveNav } = useLayoutStore();

  const handleNavClick = (item: NavItem) => {
    setActiveNav(item.section);
    if (pathname !== item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="h-full flex flex-col items-center py-4 gap-2">
      {/* Logo/Branding (Optional) */}
      <div className="flex items-center justify-center w-12 h-12 mb-4">
        <div className="w-8 h-8 rounded bg-indigo-500/20 border border-indigo-500 flex items-center justify-center text-indigo-400 font-bold text-sm">
          Og
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = activeNav === item.section;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                relative w-12 h-12 flex items-center justify-center rounded transition-all
                ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                }
                group
              `}
              title={item.label}
            >
              <IconComp className="w-6 h-6" />

              {/* Hover tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-950 text-gray-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                {item.label}
              </div>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r" />
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-white/10 my-2" />

      {/* Settings (Bottom) */}
      <button
        onClick={() => handleNavClick(NAV_ITEMS[NAV_ITEMS.length] || ({} as any))}
        className="w-12 h-12 flex items-center justify-center rounded transition-all text-gray-400 hover:text-gray-300 hover:bg-white/5 group"
        title="Settings"
      >
        <Cog6ToothIcon className="w-6 h-6" />

        {/* Hover tooltip */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-950 text-gray-300 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
          Settings
        </div>
      </button>
    </div>
  );
};

export default IconNav;
