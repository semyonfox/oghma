// Notes Sidebar Search - Search box for finding notes
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { FC, useState, useCallback } from 'react';
import PortalState from '@/lib/notes/state/portal';

const NoteSidebarSearch: FC = () => {
  const { search } = PortalState.useContainer();
  const [searchQuery, setSearchQuery] = useState('');

  const handleOpenSearch = useCallback(() => {
    search.open();
  }, [search]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return (
    <div className="px-6 py-3 border-b border-white/10">
      <div className="relative">
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleOpenSearch}
          className="w-full px-3 py-2 pl-9 bg-white/5 text-white placeholder-gray-500 rounded-md border border-white/10 focus:border-white/20 focus:outline-none transition-colors text-sm"
          aria-label="Search notes"
        />
        <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(NoteSidebarSearch);
