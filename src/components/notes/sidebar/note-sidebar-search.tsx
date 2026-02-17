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
    <div className="tree-search-wrapper">
      <div className="relative">
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleOpenSearch}
          className="tree-search"
          aria-label="Search notes"
        />
        <MagnifyingGlassIcon className="tree-search-icon" />
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
