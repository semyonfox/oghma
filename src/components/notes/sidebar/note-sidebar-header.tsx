// Notes Sidebar Header - Logo + New Note + Collapse Toggle
import { PlusIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { FC } from 'react';
import UIState from '@/lib/notes/state/ui';

interface NoteSidebarHeaderProps {
  onToggleSidebar?: () => void;
}

const NoteSidebarHeader: FC<NoteSidebarHeaderProps> = ({ onToggleSidebar }) => {
  const router = useRouter();
  const { sidebar } = UIState.useContainer();

  const handleNewNote = () => {
    router.push('/new');
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-white">📝 Notes</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* New Note Button */}
        <button
          onClick={handleNewNote}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          title="New note"
          aria-label="Create new note"
        >
          <PlusIcon className="w-5 h-5" />
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
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

export default NoteSidebarHeader;
