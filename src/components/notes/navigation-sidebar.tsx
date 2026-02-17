'use client';

import { FC } from 'react';
import {
  DocumentTextIcon,
  Squares2X2Icon,
  WindowIcon,
  CalendarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

export interface NavigationSidebarProps {
  activeSection?: 'notes' | 'flashcards' | 'canvas' | 'calendar' | 'settings';
  onSectionChange?: (section: string) => void;
}

export const NavigationSidebar: FC<NavigationSidebarProps> = ({
  activeSection = 'notes',
  onSectionChange,
}) => {
  const sections = [
    { id: 'notes', icon: DocumentTextIcon, label: 'Notes' },
    { id: 'flashcards', icon: Squares2X2Icon, label: 'Flashcards' },
    { id: 'canvas', icon: WindowIcon, label: 'Canvas' },
    { id: 'calendar', icon: CalendarIcon, label: 'Calendar' },
  ];

  const handleSectionClick = (sectionId: string) => {
    if (onSectionChange) {
      onSectionChange(sectionId);
    }
  };

  return (
    <div className="w-14 h-screen bg-surface border-r border-border flex flex-col items-center py-3 sticky top-0 hidden md:flex">
      {/* Logo/Branding */}
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 mb-8 flex-shrink-0">
        <span className="text-white font-bold text-sm">S</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section.id)}
              className={`relative p-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              }`}
              title={section.label}
              aria-label={section.label}
            >
              <Icon className="w-5 h-5" />
              
              {/* Active indicator dot */}
              {isActive && (
                <div className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
              )}

              {/* Tooltip on hover */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-background border border-border rounded text-xs whitespace-nowrap text-text opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {section.label}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Settings at Bottom */}
      <button
        onClick={() => handleSectionClick('settings')}
        className={`p-2.5 rounded-lg transition-all duration-200 group relative ${
          activeSection === 'settings'
            ? 'bg-primary text-white'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text'
        }`}
        title="Settings"
        aria-label="Settings"
      >
        <Cog6ToothIcon className="w-5 h-5" />
        
        {/* Active indicator dot */}
        {activeSection === 'settings' && (
          <div className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
        )}

        {/* Tooltip on hover */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-background border border-border rounded text-xs whitespace-nowrap text-text opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          Settings
        </div>
      </button>
    </div>
  );
};

export default NavigationSidebar;
