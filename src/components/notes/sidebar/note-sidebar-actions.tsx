// Notes Sidebar Actions - Theme toggle, settings, trash, and user profile
import {
  MoonIcon,
  SunIcon,
  Cog6ToothIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { FC, useCallback, useState, useEffect } from 'react';
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

  // Fetch user data on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
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
    <div className="px-3 py-4 border-t border-white/10 space-y-4 sm:px-6 sm:space-y-4">
      {/* Action Buttons - Stack on mobile, flex on desktop */}
      <div className="hidden sm:flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={handleThemeToggle}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
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
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          title="Settings"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Settings</span>
        </Link>

        {/* Trash Button */}
        <button
          onClick={handleTrashClick}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          title="Trash"
          aria-label="Open trash"
        >
          <TrashIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Trash</span>
        </button>
      </div>

      {/* User Profile Section */}
      {user && (
        <button className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors text-left">
          {user.avatar ? (
            <img
              alt={user.name || user.email}
              src={user.avatar}
              className="w-8 h-8 rounded-full flex-none bg-gray-800 object-cover"
            />
          ) : (
            <UserCircleIcon className="w-8 h-8 flex-none text-gray-400" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {user.name || user.email.split('@')[0]}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </button>
      )}
    </div>
  );
};

export default NoteSidebarActions;
