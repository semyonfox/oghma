// Notes Sidebar Header - Logo + New Note + Collapse Toggle
import { PlusIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import React, { FC, useCallback } from 'react';
import UIState from '@/lib/notes/state/ui';

interface NoteSidebarHeaderProps {
  onToggleSidebar?: () => void;
}

const NoteSidebarHeader: FC<NoteSidebarHeaderProps> = ({ onToggleSidebar }) => {
  const router = useRouter();
  const { sidebar } = UIState.useContainer();

  const handleNewNote = useCallback(() => {
    router.push('/new');
  }, [router]);

  return (
    <div className="tree-header">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="tree-header-title">📝 Notes</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* New Note Button */}
        <button
          onClick={handleNewNote}
          className="icon-button"
          title="New note"
          aria-label="Create new note"
        >
          <PlusIcon className="w-5 h-5" />
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggleSidebar}
          className="icon-button"
          title="Collapse sidebar"
          aria-label="Toggle sidebar"
        >
          <ChevronDoubleLeftIcon
            className={`w-5 h-5 transition-transform ${sidebar?.isFold ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>
  );
};

export default React.memo(NoteSidebarHeader);
