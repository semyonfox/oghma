// Notes Sidebar Search - Search box for finding notes
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { FC, useState, useCallback } from 'react';
import usePortalStore from '@/lib/notes/state/portal';

const NoteSidebarSearch: FC = () => {
  const { search } = usePortalStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleOpenSearch = useCallback(() => {
    search.open();
  }, [search]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return (
    <div className="px-4 py-3 border-b border-slate-700 flex-shrink-0">
      <div className="relative">
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleOpenSearch}
          className="w-full px-3 py-2 pl-9 bg-white/5 text-slate-300 placeholder:text-slate-600 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors duration-200"
          aria-label="Search notes"
        />
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text transition-colors"
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
