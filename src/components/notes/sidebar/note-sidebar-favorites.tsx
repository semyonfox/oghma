// Notes Sidebar Favorites - Show pinned/favorite notes
import { StarIcon } from '@heroicons/react/24/solid';
import React, { FC, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NoteTreeState from '@/lib/notes/state/tree';
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

  // Don't show section if no favorites
  if (favorites.length === 0) {
    return null;
  }

  const handleFavoriteClick = useCallback((noteId: string) => {
    router.push(`/${noteId}`);
  }, [router]);

  return (
    <div className="px-6 py-3 border-b border-white/10">
      {/* Section Title */}
      <div className="flex items-center gap-2 mb-2">
        <StarIcon className="w-4 h-4 text-yellow-400" />
        <h3 className="text-xs font-semibold text-gray-400 uppercase">Your Favorites</h3>
      </div>

      {/* Favorites List */}
      <div className="space-y-1">
        {favorites.map((favorite) => (
          <button
            key={favorite.id}
            onClick={() => handleFavoriteClick(favorite.id)}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors truncate flex items-center gap-2"
            title={favorite.title}
          >
            <span>{favorite.emoji}</span>
            <span className="truncate">{favorite.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default React.memo(NoteSidebarFavorites);
