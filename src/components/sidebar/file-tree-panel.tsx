'use client';

import { FC, useState, useEffect, useRef } from 'react';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import SidebarList from '@/components/notes/sidebar/sidebar-list';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import useTreeAPI from '@/lib/notes/api/tree';
import useNoteAPI from '@/lib/notes/api/note';
import useTrashAPI from '@/lib/notes/api/trash';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import useTrashStore from '@/lib/notes/state/trash';
import { clearDeduplicationCache } from '@/lib/notes/api/request-deduplicator';
import { purgeNonUUIDNoteCache } from '@/lib/notes/cache/note';
import { toast } from 'sonner';
import useI18n from '@/lib/notes/hooks/use-i18n';

/**
 * File tree panel with search and collapsible sections
 * Wraps react-arborist SidebarList component
 * Also handles dependency injection and tree initialization
 */
const FileTreePanel: FC = () => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const { collapsedSections, toggleCollapsedSection } = useLayoutStore();

  // API hooks (must be called in a component)
  const treeAPI = useTreeAPI();
  const noteAPI = useNoteAPI();
  const trashAPI = useTrashAPI();

  const initDone = useRef(false);

  // inject API dependencies into zustand stores and initialize tree
  // only run once on mount using initDone.current ref to prevent re-initialization
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // wire up stores with API instances
    // IMPORTANT: pass store references (not snapshots) so mutations update live state
    const toastFn = (msg: string, type?: string) => {
      if (type === 'error') toast.error(msg);
      else toast(msg);
    };

    useNoteTreeStore.getState().setDependencies(treeAPI, noteAPI, toastFn);
    useNoteStore.getState().setDependencies(noteAPI, useNoteTreeStore, toastFn);
    useTrashStore.getState().setDependencies(trashAPI, useNoteTreeStore);

    // clear any stale dedup cache from a previous mount / HMR rebuild
    // so initTree always fetches fresh data on the first load
    clearDeduplicationCache();

    // purge any nanoid-format keys left from before the UUID v7 migration
    purgeNonUUIDNoteCache().catch(e =>
      console.warn('Failed to purge stale note cache:', e)
    );

    // load the tree
    useNoteTreeStore.getState().initTree()
      .catch((e) => console.error('Error initializing tree:', e));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search Box */}
      <div className="flex-shrink-0 p-3 border-b border-border-subtle">
        <div className="relative flex items-center">
          <MagnifyingGlassIcon className="absolute left-3 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder={t('Find...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-border-subtle rounded text-xs text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 p-1 hover:bg-white/5 rounded text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarList />
      </div>
    </div>
  );
};

export default FileTreePanel;
