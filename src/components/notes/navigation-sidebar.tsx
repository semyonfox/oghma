'use client';

import { FC } from 'react';
import {
  DocumentTextIcon,
  Squares2X2Icon,
  WindowIcon,
  CalendarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';

export interface NavigationSidebarProps {
  activeSection?: 'notes' | 'flashcards' | 'canvas' | 'calendar' | 'settings';
  onSectionChange?: (section: string) => void;
}

export const NavigationSidebar: FC<NavigationSidebarProps> = ({
  activeSection = 'notes',
  onSectionChange,
}) => {
  const { t } = useI18n();
  const sections = [
    { id: 'notes', icon: DocumentTextIcon, label: t('Notes') },
    { id: 'flashcards', icon: Squares2X2Icon, label: t('Flashcards') },
    { id: 'canvas', icon: WindowIcon, label: t('Canvas') },
    { id: 'calendar', icon: CalendarIcon, label: t('Calendar') },
  ];

  const handleSectionClick = (sectionId: string) => {
    if (onSectionChange) {
      onSectionChange(sectionId);
    }
  };

  return (
    <div className="w-14 h-screen bg-slate-800 border-r border-slate-700 sticky top-0 flex flex-col items-center py-3 gap-3" role="navigation" aria-label={t('Main navigation')}>
      {/* Logo/Branding */}
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 mb-2 flex-shrink-0 text-white font-bold text-sm" aria-label={t('SocsBoard')} role="img">
        S
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-2" aria-label={t('Section navigation')}>
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section.id)}
              className={`relative p-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-500 text-white' 
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
              }`}
              title={section.label}
              aria-label={section.label}
              aria-current={isActive ? 'page' : undefined}
              role="menuitem"
              aria-pressed={isActive}
            >
              <Icon className="w-6 h-6" />
              
              {/* Active indicator dot */}
              {isActive && (
                <div 
                  className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-white rounded-full" 
                  aria-hidden="true"
                />
              )}

              {/* Tooltip on hover */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs whitespace-nowrap text-slate-300 pointer-events-none z-50 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" role="tooltip" id={`tooltip-${section.id}`}>
                {section.label}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Settings at Bottom */}
      <button
        onClick={() => handleSectionClick('settings')}
        className={`relative p-3 rounded-lg transition-all duration-200 mt-auto ${
          activeSection === 'settings' 
            ? 'bg-blue-500 text-white' 
            : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
        }`}
        title={t('Settings')}
        aria-label={t('Settings')}
        aria-current={activeSection === 'settings' ? 'page' : undefined}
        role="menuitem"
        aria-pressed={activeSection === 'settings'}
      >
        <Cog6ToothIcon className="w-6 h-6" />
        
        {/* Active indicator dot */}
        {activeSection === 'settings' && (
          <div 
            className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-white rounded-full" 
            aria-hidden="true"
          />
        )}

        {/* Tooltip on hover */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs whitespace-nowrap text-slate-300 pointer-events-none z-50 shadow-lg opacity-0 hover:opacity-100 transition-opacity" role="tooltip" id="tooltip-settings">
          {t('Settings')}
        </div>
      </button>
    </div>
  );
};

export default NavigationSidebar;
