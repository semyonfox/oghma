// Notes Sidebar Favorites - Show pinned/favorite notes
import { StarIcon } from '@heroicons/react/24/solid';
import { FC, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import NoteTreeState from '@/lib/notes/state/tree';
import { NOTE_PINNED } from '@/lib/notes/types/meta';

const NoteSidebarFavorites: FC = () => {
  const router = useRouter();
  const { tree } = NoteTreeState.useContainer();

  // Filter pinned notes
  const favorites = useMemo(() => {
    return Object.values(tree.items)
      .filter((item) => item.data?.pinned === NOTE_PINNED.PINNED)
      .map((item) => ({
        id: item.id,
        title: item.data?.title || 'Untitled',
        emoji: item.data?.pic || '📄',
      }));
  }, [tree.items]);

  // Don't show section if no favorites
  if (favorites.length === 0) {
    return null;
  }

  const handleFavoriteClick = (noteId: string) => {
    router.push(`/${noteId}`);
  };

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

export default NoteSidebarFavorites;
