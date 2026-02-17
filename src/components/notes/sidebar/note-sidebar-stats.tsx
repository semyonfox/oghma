// Notes Sidebar Stats - Display note count and sync status
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import React, { FC, useMemo } from 'react';
import { useTreeItems, useItemCount } from '@/lib/notes/hooks/use-tree-selectors';

const NoteSidebarStats: FC = () => {
  // Use tree selectors to prevent re-renders when other state changes
  const treeItems = useTreeItems();
  const itemCount = useItemCount();

  // Calculate stats from tree - memoized to prevent unnecessary recalculations
  const stats = useMemo(() => {
    const items = Object.values(treeItems);
    const noteCount = items.length;
    const syncedCount = items.filter((item) => item.data).length;
    const allSynced = noteCount === syncedCount;

    return {
      noteCount,
      syncedCount,
      allSynced,
    };
  }, [treeItems]);

  return (
    <div className="px-6 py-3 border-b border-white/10">
      <div className="space-y-2">
        {/* Note Count */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Notes</span>
          <span className="text-white font-semibold">{stats.noteCount}</span>
        </div>

        {/* Sync Status */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Status</span>
          <div className="flex items-center gap-1.5">
            {stats.allSynced ? (
              <>
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-semibold">Synced</span>
              </>
            ) : (
              <>
                <ClockIcon className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 text-xs">
                  {stats.syncedCount}/{stats.noteCount}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(NoteSidebarStats);
