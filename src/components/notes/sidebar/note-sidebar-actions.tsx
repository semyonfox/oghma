// Notes Sidebar Actions - Theme toggle, settings, trash, and user profile
import {
  MoonIcon,
  SunIcon,
  Cog6ToothIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import React, { FC, useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import UIState from '@/lib/notes/state/ui';
import PortalState from '@/lib/notes/state/portal';
import { getCurrentUser } from '@/lib/apiClient';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

const NoteSidebarActions: FC = () => {
  const uiState = UIState.useContainer();
  const { trash } = PortalState.useContainer();
  const [user, setUser] = useState<User | null>(null);

  // Extract settings from UIState
  const settingsState = uiState.settings;
  const updateSettings = settingsState?.updateSettings;

  // Memoize user fetch to prevent unnecessary API calls on re-render
  const fetchUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  }, []);

  // Fetch user data on mount (only once)
  useEffect(() => {
    fetchUser();
  }, []);

  // Get current theme from settings
  const currentTheme = settingsState?.settings?.theme || 'dark';
  const isDark = currentTheme === 'dark';

  const handleThemeToggle = useCallback(async () => {
    if (!updateSettings) return;
    const newTheme = isDark ? 'light' : 'dark';
    await updateSettings({ theme: newTheme });
  }, [isDark, updateSettings]);

  const handleTrashClick = useCallback(() => {
    trash.open();
  }, [trash]);

  return (
    <div className="tree-actions">
      {/* Action Buttons - Stack on mobile, flex on desktop */}
      <div className="hidden sm:flex items-center gap-2 w-full">
        {/* Theme Toggle */}
        <button
          onClick={handleThemeToggle}
          className="tree-action-button"
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          aria-label={`Theme: ${currentTheme}`}
        >
          {isDark ? (
            <SunIcon className="w-4 h-4" />
          ) : (
            <MoonIcon className="w-4 h-4" />
          )}
          <span className="text-xs font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        {/* Settings Link */}
        <Link
          href="/settings"
          className="tree-action-button"
          title="Settings"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Settings</span>
        </Link>

        {/* Trash Button */}
        <button
          onClick={handleTrashClick}
          className="tree-action-button"
          title="Trash"
          aria-label="Open trash"
        >
          <TrashIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Trash</span>
        </button>
      </div>

      {/* User Profile Section */}
      {user && (
        <button className="w-full flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-text hover:bg-white/5 rounded-md transition-colors text-left">
          {user.avatar ? (
            <img
              alt={user.name || user.email}
              src={user.avatar}
              className="w-8 h-8 rounded-full flex-none bg-surface object-cover"
            />
          ) : (
            <UserCircleIcon className="w-8 h-8 flex-none text-text-tertiary" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">
              {user.name || user.email.split('@')[0]}
            </p>
            <p className="text-xs text-text-tertiary truncate">{user.email}</p>
          </div>
        </button>
      )}
    </div>
  );
};

export default React.memo(NoteSidebarActions);
