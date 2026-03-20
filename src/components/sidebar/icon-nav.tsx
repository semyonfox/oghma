'use client';

import { FC } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import useI18n from '@/lib/notes/hooks/use-i18n';
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  SparklesIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  id: string;
  labelKey: string;
  icon: FC<{ className?: string }>;
  href: string;
  section: 'notes' | 'search' | 'calendar' | 'settings' | 'chat';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'notes',    labelKey: 'Notes',    icon: DocumentTextIcon,     href: '/notes',  section: 'notes' },
  { id: 'search',   labelKey: 'Search',   icon: MagnifyingGlassIcon,  href: '/notes',  section: 'search' },
  { id: 'calendar', labelKey: 'Calendar', icon: CalendarIcon,         href: '/notes',  section: 'calendar' },
  { id: 'chat',     labelKey: 'AI Chat',  icon: SparklesIcon,         href: '/chat',   section: 'chat' },
];

/**
 * Icon-only navigation sidebar (56px fixed width)
 * VSCode-style left navigation with hover tooltips
 */
const IconNav: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, setActiveNav } = useLayoutStore();
  const { t } = useI18n();

  const handleNavClick = (item: NavItem) => {
    setActiveNav(item.section);
    if (pathname !== item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="h-full flex flex-col items-center py-4 gap-2">
      {/* Logo/Branding */}
      <Link href="/" className="flex items-center justify-center w-10 h-10 mb-4 hover:opacity-70 transition-opacity">
        <img src="/oghmanotes.svg" alt="OghmaNotes Logo" className="w-6 h-6" />
      </Link>

      {/* Navigation Items */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = activeNav === item.section;
          const translatedLabel = t(item.labelKey);

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                relative w-10 h-10 flex items-center justify-center rounded transition-colors
                ${isActive
                  ? 'bg-white/8 text-text-secondary'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-white/5'
                }
                group
              `}
              title={translatedLabel}
            >
              <IconComp className="w-5 h-5" />

              {/* Hover tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle">
                {translatedLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-white/10 my-2" />

      {/* Settings (Bottom) */}
      <button
        onClick={() => handleNavClick({
          id: 'settings',
          labelKey: 'Settings',
          icon: Cog6ToothIcon,
          href: '/settings',
          section: 'settings'
        })}
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors text-text-tertiary hover:text-text-secondary hover:bg-white/5 group relative ${
          activeNav === 'settings' ? 'bg-white/8 text-text-secondary' : ''
        }`}
        title={t('Settings')}
      >
        <Cog6ToothIcon className="w-5 h-5" />

        {/* Hover tooltip */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle">
          {t('Settings')}
        </div>
      </button>
    </div>
  );
};

export default IconNav;
