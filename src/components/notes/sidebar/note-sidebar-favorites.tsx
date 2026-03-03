// Notes Sidebar Favorites - Show pinned/favorite notes
import { StarIcon } from '@heroicons/react/24/solid';
import React, { FC, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useNoteTreeStore from '@/lib/notes/state/tree';
import { useTreeItems } from '@/lib/notes/hooks/use-tree-selectors';
import { NOTE_PINNED } from '@/lib/notes/types/meta';

const NoteSidebarFavorites: FC = () => {
  const router = useRouter();
  // Use tree selector to prevent re-renders when other state changes
  const treeItems = useTreeItems();

  // Filter pinned notes - memoized to prevent unnecessary recalculations
  const favorites = useMemo(() => {
    return Object.values(treeItems)
      .filter((item) => item.data?.pinned === NOTE_PINNED.PINNED)
      .map((item) => ({
        id: item.id,
        title: item.data?.title || 'Untitled',
        emoji: item.data?.pic || '📄',
      }));
  }, [treeItems]);

  const handleFavoriteClick = useCallback((noteId: string) => {
    router.push(`/${noteId}`);
  }, [router]);

  if (favorites.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-3 border-b border-slate-700 flex-shrink-0">
      {/* Section Title */}
      <div className="flex items-center gap-2 mb-2">
        <StarIcon className="w-4 h-4 text-amber-500" />
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide m-0">Your Favorites</h3>
      </div>

      {/* Favorites List */}
      <div className="space-y-1 px-1">
        {favorites.map((favorite) => (
          <button
            key={favorite.id}
            onClick={() => handleFavoriteClick(favorite.id)}
            className="flex items-center pr-2 w-full overflow-hidden text-slate-400 hover:text-slate-300 hover:bg-white/5 transition-colors duration-200 rounded px-2 py-1.5 cursor-pointer"
            title={favorite.title}
          >
            <span>{favorite.emoji}</span>
            <span className="truncate ml-2 text-sm">{favorite.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(NoteSidebarFavorites);
