'use client';

import { FC, useState, useMemo } from 'react';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import SidebarList from '@/components/notes/sidebar/sidebar-list';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * File tree panel with search and collapsible sections
 * Wraps react-arborist SidebarList component
 */
const FileTreePanel: FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { collapsedSections, toggleCollapsedSection } = useLayoutStore();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search Box */}
      <div className="flex-shrink-0 p-3 border-b border-white/10">
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="absolute left-3 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-white/10 rounded text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarList />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-white/10 text-xs text-gray-500">
        <div className="truncate">Ready</div>
      </div>
    </div>
  );
};

export default FileTreePanel;
