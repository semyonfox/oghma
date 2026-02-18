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
    <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 bg-white/5">
      <div className="space-y-2">
        {/* Note Count */}
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-slate-400">Notes</span>
          <span className="text-slate-300 font-semibold">{stats.noteCount}</span>
        </div>

        {/* Sync Status */}
        <div className="flex items-center justify-between py-2 text-sm">
          <span className="text-slate-400">Status</span>
          <div className="flex items-center gap-1.5">
            {stats.allSynced ? (
              <>
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span className="text-green-400 font-semibold">Synced</span>
              </>
            ) : (
              <>
                <ClockIcon className="w-4 h-4 text-amber-500" />
                <span className="text-amber-400 text-xs">
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
