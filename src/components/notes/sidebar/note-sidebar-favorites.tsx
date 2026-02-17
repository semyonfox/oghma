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
    <div className="tree-search-wrapper border-b">
      {/* Section Title */}
      <div className="flex items-center gap-2 mb-2 px-4 pt-3">
        <StarIcon className="w-4 h-4 text-ai" />
        <h3 className="tree-section-label m-0">Your Favorites</h3>
      </div>

      {/* Favorites List */}
      <div className="space-y-1 px-3">
        {favorites.map((favorite) => (
          <button
            key={favorite.id}
            onClick={() => handleFavoriteClick(favorite.id)}
            className="tree-item-base w-full text-left"
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
