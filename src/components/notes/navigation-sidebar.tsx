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
    <div className="nav-sidebar hidden md:flex" role="navigation" aria-label="Main navigation">
      {/* Logo/Branding */}
      <div className="nav-logo" aria-label="SocsBoard" role="img">
        <span>S</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-3" aria-label="Section navigation">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section.id)}
              className={`nav-item group ${isActive ? 'nav-item-active' : ''}`}
              title={section.label}
              aria-label={section.label}
              aria-current={isActive ? 'page' : undefined}
              role="menuitem"
              aria-pressed={isActive}
            >
              <Icon className="w-5 h-5" />
              
              {/* Active indicator dot */}
              {isActive && (
                <div 
                  className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" 
                  aria-hidden="true"
                />
              )}

              {/* Tooltip on hover */}
              <div className="nav-tooltip" role="tooltip" id={`tooltip-${section.id}`}>
                {section.label}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Settings at Bottom */}
      <button
        onClick={() => handleSectionClick('settings')}
        className={`nav-item group ${activeSection === 'settings' ? 'nav-item-active' : ''}`}
        title="Settings"
        aria-label="Settings"
        aria-current={activeSection === 'settings' ? 'page' : undefined}
        role="menuitem"
        aria-pressed={activeSection === 'settings'}
      >
        <Cog6ToothIcon className="w-5 h-5" />
        
        {/* Active indicator dot */}
        {activeSection === 'settings' && (
          <div 
            className="absolute -right-1.5 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" 
            aria-hidden="true"
          />
        )}

        {/* Tooltip on hover */}
        <div className="nav-tooltip" role="tooltip" id="tooltip-settings">
          Settings
        </div>
      </button>
    </div>
  );
};

export default NavigationSidebar;
