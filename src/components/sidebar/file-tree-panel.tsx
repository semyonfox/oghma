'use client';

import { FC, useState, useEffect, useRef } from 'react';
import SidebarList from '@/components/notes/sidebar/sidebar-list';
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
 * Obsidian-style file tree panel
 * clean header with action buttons, scrollable tree, no search box in header
 */
const FileTreePanel: FC = () => {
  const { t } = useI18n();

  // API hooks
  const treeAPI = useTreeAPI();
  const noteAPI = useNoteAPI();
  const trashAPI = useTrashAPI();

  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const toastFn = (msg: string, type?: string) => {
      if (type === 'error') toast.error(msg);
      else toast(msg);
    };

    useNoteTreeStore.getState().setDependencies(treeAPI, noteAPI, toastFn);
    useNoteStore.getState().setDependencies(noteAPI, useNoteTreeStore, toastFn);
    useTrashStore.getState().setDependencies(trashAPI, useNoteTreeStore);

    clearDeduplicationCache();

    purgeNonUUIDNoteCache().catch(e =>
      console.warn('Failed to purge stale note cache:', e)
    );

    useNoteTreeStore.getState().initTree()
      .catch((e) => console.error('Error initializing tree:', e));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* tree fills the entire panel - header is inside SidebarList */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden obsidian-scrollbar">
        <SidebarList />
      </div>
    </div>
  );
};

export default FileTreePanel;
