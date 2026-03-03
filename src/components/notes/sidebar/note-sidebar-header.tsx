// Notes Sidebar Header - Logo + New Note + Collapse Toggle
import { PlusIcon, ChevronDoubleLeftIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import React, { FC, useCallback } from 'react';
import useUIComposite from '@/lib/notes/state/ui';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';

interface NoteSidebarHeaderProps {
  onToggleSidebar?: () => void;
}

const NoteSidebarHeader: FC<NoteSidebarHeaderProps> = ({ onToggleSidebar }) => {
  const router = useRouter();
  const { sidebar } = useUIComposite();
  const { genNewId } = useNoteTreeStore();
  const { createNote } = useNoteStore();

  const handleNewNote = useCallback(async () => {
    // Create a new note directly without navigation
    const newId = genNewId();
    const newNote = await createNote({
      id: newId,
      title: 'Untitled',
      content: '\n',
      pid: undefined,
    });

    if (newNote) {
      router.push(`/notes/${newId}`);
    }
  }, [genNewId, createNote, router]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white">📝 Notes</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* New Note Button */}
        <button
          onClick={handleNewNote}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
          title="New note"
          aria-label="Create new note"
        >
          <PlusIcon className="w-5 h-5" />
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
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
