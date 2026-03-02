// Notes Sidebar Actions - Theme toggle, settings, trash, and user profile
import {
  MoonIcon,
  SunIcon,
  Cog6ToothIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import React, { FC, useCallback } from 'react';
import Link from 'next/link';
import UIState from '@/lib/notes/state/ui';
import PortalState from '@/lib/notes/state/portal';
import { getCurrentUser } from '@/lib/apiClient';
import { useSWR } from '@/lib/notes/hooks/use-swr';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

const NoteSidebarActions: FC = () => {
  const uiState = UIState.useContainer();
  const { trash } = PortalState.useContainer();
  const { data: user } = useSWR<User | null>(
    'current-user',
    async () => {
      try {
        return await getCurrentUser();
      } catch (error) {
        console.error('Failed to load user:', error);
        return null;
      }
    }
  );

  // Extract settings from UIState
  const settingsState = uiState.settings;
  const updateSettings = settingsState?.updateSettings;

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
    <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 flex items-center gap-2">
      {/* Action Buttons - Stack on mobile, flex on desktop */}
      <div className="hidden sm:flex items-center gap-2 w-full">
         {/* Theme Toggle */}
         <button
           onClick={handleThemeToggle}
           className="flex-1 px-3 py-2 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-colors duration-200 text-sm font-medium flex items-center gap-2 justify-center"
           title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
           aria-label={`Theme: ${currentTheme}`}
         >
           {isDark ? (
             <SunIcon className="w-4 h-4" />
           ) : (
             <MoonIcon className="w-4 h-4" />
           )}
           <span className="text-xs">{isDark ? 'Light' : 'Dark'}</span>
         </button>

         {/* Settings Link */}
         <Link
           href="/settings"
           className="flex-1 px-3 py-2 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-colors duration-200 text-sm font-medium flex items-center gap-2 justify-center"
           title="Settings"
         >
           <Cog6ToothIcon className="w-4 h-4" />
           <span className="text-xs">Settings</span>
         </Link>

         {/* Trash Button */}
         <button
           onClick={handleTrashClick}
           className="flex-1 px-3 py-2 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-colors duration-200 text-sm font-medium flex items-center gap-2 justify-center"
           title="Trash"
           aria-label="Open trash"
         >
           <TrashIcon className="w-4 h-4" />
           <span className="text-xs">Trash</span>
         </button>
       </div>

       {/* User Profile Section */}
       {user && (
         <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-300 hover:bg-white/5 rounded-md transition-colors duration-200 text-left">
           {user.avatar ? (
             <img
               alt={user.name || user.email}
               src={user.avatar}
               className="w-8 h-8 rounded-full flex-none bg-slate-800 object-cover"
             />
           ) : (
             <UserCircleIcon className="w-8 h-8 flex-none text-slate-500" />
           )}
           <div className="flex-1 min-w-0">
             <p className="text-sm font-semibold text-slate-300 truncate">
               {user.name || user.email.split('@')[0]}
             </p>
             <p className="text-xs text-slate-500 truncate">{user.email}</p>
           </div>
         </button>
       )}
     </div>
   );
};

export default React.memo(NoteSidebarActions);
