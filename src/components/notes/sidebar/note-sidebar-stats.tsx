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
    <div className="tree-stats">
      <div className="space-y-2">
        {/* Note Count */}
        <div className="tree-stats-item">
          <span className="tree-stats-label">Notes</span>
          <span className="tree-stats-value">{stats.noteCount}</span>
        </div>

        {/* Sync Status */}
        <div className="tree-stats-item">
          <span className="tree-stats-label">Status</span>
          <div className="flex items-center gap-1.5">
            {stats.allSynced ? (
              <>
                <CheckCircleIcon className="w-4 h-4 text-success" />
                <span className="text-success font-semibold">Synced</span>
              </>
            ) : (
              <>
                <ClockIcon className="w-4 h-4 text-ai" />
                <span className="text-ai text-xs">
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
