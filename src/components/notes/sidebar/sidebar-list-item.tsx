// extracted from Notea (MIT License)
// rewritten for App Router + react-arborist v3.4.3 + Tailwind (no MUI)
import { NoteModel } from '@/lib/notes/types/note';
import Link from 'next/link';
import React, { FC, MouseEvent, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import IconButton from '@/components/icon-button';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import usePortalStore from '@/lib/notes/state/portal';
import useSyncStatusStore from '@/lib/notes/state/sync-status';
import useI18n from '@/lib/notes/hooks/use-i18n';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import { buildFileSpec } from '@/lib/notes/utils/file-spec';

const TextSkeleton = () => (
    <span className="inline-block w-20 h-4 bg-neutral-300 dark:bg-neutral-700 rounded animate-pulse" />
);

const SidebarListItem: FC<{
    item: NoteModel;
    innerRef: (el: HTMLElement | null) => void;
    onToggle: () => void;
    isExpanded: boolean;
    hasChildren: boolean;
    snapshot: {
        isDragging: boolean;
    };
    style?: {
        paddingLeft: number;
    };
    isRenaming?: boolean;
    onRenameComplete?: (newTitle: string) => void;
}> = ({
    item,
    innerRef,
    onToggle,
    isExpanded,
    snapshot,
    hasChildren,
    isRenaming = false,
    onRenameComplete,
    ...attrs
}) => {
    const { t } = useI18n();
    const router = useRouter();
    const pathname = usePathname();
    const { mutateItem, initLoaded, genNewId } = useNoteTreeStore();
    const { createNote } = useNoteStore();
    const { activePane, setPaneA, setPaneB, setActivePane } = useLayoutStore();
    const {
        menu: { open, setData, setAnchor },
    } = usePortalStore();
    const syncStatus = useSyncStatusStore((s) => s.status[item.id]);
    const [renameValue, setRenameValue] = useState(item.title || '');
    const renameInputRef = useRef<HTMLInputElement>(null);

    // derive active note id from pathname (e.g. "/abc123" -> "abc123")
    const activeId: string | null = useMemo(() => {
        if (!pathname || pathname === '/') return null;
        const segments = pathname.split('/').filter(Boolean);
        if (segments[0] === 'notes') {
            return segments[1] || null;
        }
        return segments[0] || null;
    }, [pathname]);

    // focus input when entering rename mode
    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    // Determine link href based on current page
    const linkHref = useMemo(() => {
        if (hasChildren) {
            return '#';
        }
        // If on /notes page, stay within notes (e.g. /notes/note-id)
        // Otherwise navigate to root note page (e.g. /note-id)
        if (pathname?.startsWith('/notes')) {
            return `/notes/${item.id}`;
        }
        return `/${item.id}`;
    }, [pathname, item.id, hasChildren]);

    const onAddNote = useCallback(
        async (e: MouseEvent) => {
            e.preventDefault();
            // Create a new note under this item without navigation
            const newId = genNewId();
            const newNote = await createNote({
                id: newId,
                title: 'Untitled',
                content: '\n',
                pid: item.id,
            });

            if (newNote) {
                // Expand the parent and navigate to the new note
                await mutateItem(item.id, {
                    isExpanded: true,
                });
                router.push(`/notes/${newId}`);
            }
        },
        [item.id, mutateItem, genNewId, createNote, router]
    );

    const handleClickMenu = useCallback(
        (event: MouseEvent) => {
            event.preventDefault();
            setAnchor(event.target as Element);
            open();
            setData(item);
        },
        [item, open, setAnchor, setData]
    );

    const handleClickIcon = useCallback(
        (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
        },
        [onToggle]
    );

    const handleClickItem = useCallback(
        (e: MouseEvent) => {
            // only folders can be toggled on single click
            if (hasChildren) {
                e.preventDefault();
                onToggle();
            }
            // files require double click - Link handles single click navigation
        },
        [hasChildren, onToggle]
    );

    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            // double click opens files, prevents default expand behavior
            if (!hasChildren) {
                e.preventDefault();
                setPaneA(buildFileSpec(item));
                setActivePane('A');
                router.push(linkHref);
            }
        },
        [hasChildren, item, linkHref, router, setActivePane, setPaneA]
    );

    const openInPane = useCallback(
        (pane: 'A' | 'B') => (e: MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();

            const spec = buildFileSpec(item);
            if (pane === 'A') {
                setPaneA(spec);
                setActivePane('A');
                router.push(linkHref);
                return;
            }

            setPaneB(spec);
            setActivePane('B');
        },
        [item, linkHref, router, setActivePane, setPaneA, setPaneB]
    );

    // Memoize rename completion handler
    const handleRenameCompleteMemoized = useCallback(
        (newTitle: string) => {
            if (newTitle.trim() && newTitle !== item.title) {
                onRenameComplete?.(newTitle);
            } else {
                onRenameComplete?.(item.title || '');
            }
        },
        [onRenameComplete, item.title]
    );

    const emoji = useMemo(() => {
        const emoji = item.title?.match(/\p{Emoji}/u);
        if (emoji?.length === 1) return emoji[0];
        return undefined;
    }, [item.title]);

    return (
        <>
             <div
                 {...attrs}
                 ref={innerRef}
                 className={`flex items-center pr-2 overflow-hidden text-slate-400 hover:text-slate-300 hover:bg-white/5 transition-colors duration-200 rounded px-2 py-1.5 cursor-pointer group ${
                     snapshot.isDragging ? 'shadow' : ''
                 } ${
                     activeId === item.id ? 'bg-white/10 text-slate-300' : ''
                 }`}
                 role="treeitem"
                 aria-expanded={hasChildren ? isExpanded : undefined}
                 aria-selected={activeId === item.id}
                 aria-current={activeId === item.id ? 'page' : undefined}
              >
                  <Link 
                      href={linkHref}
                      className="flex flex-1 items-center truncate"
                      onClick={handleClickItem}
                      onDoubleClick={handleDoubleClick}
                      aria-label={item.title || t('Untitled')}
                  >
                      {hasChildren ? (
                          // Folders: show expand/collapse icon
                          emoji ? (
                              <span
                                  onClick={handleClickIcon}
                                  className="flex-shrink-0 block p-0.5 cursor-pointer w-6 h-6 rounded mr-1 text-center hover:bg-white/10 transition-colors"
                                  role="button"
                                  tabIndex={0}
                                  aria-label={isExpanded ? t('Collapse') : t('Expand')}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          handleClickIcon(e as any);
                                      }
                                  }}
                              >
                                  {emoji}
                              </span>
                          ) : (
                              <IconButton
                                  className="flex-shrink-0 w-4 h-4 mr-1 transition-transform transform"
                                  icon="ChevronRight"
                                  iconClassName={`${isExpanded ? 'rotate-90' : ''}`}
                                  onClick={handleClickIcon}
                                  aria-label={isExpanded ? t('Collapse') : t('Expand')}
                              ></IconButton>
                          )
                      ) : (
                          // Files: just show the file icon, no click handler
                          <IconButton
                              className="flex-shrink-0 w-4 h-4 mr-1"
                              icon={item.title ? 'DocumentText' : 'Document'}
                              aria-label={t('Document')}
                              onClick={(e) => e.preventDefault()}
                          ></IconButton>
                      )}

                     {isRenaming ? (
                         <input
                             ref={renameInputRef}
                             type="text"
                             value={renameValue}
                             onChange={(e) => setRenameValue(e.target.value)}
                             onBlur={() => handleRenameCompleteMemoized(renameValue)}
                             onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                     e.preventDefault();
                                     if (renameValue.trim()) {
                                         handleRenameCompleteMemoized(renameValue);
                                     }
                                 } else if (e.key === 'Escape') {
                                     e.preventDefault();
                                     setRenameValue(item.title || '');
                                     handleRenameCompleteMemoized(item.title || '');
                                 }
                             }}
                             className="flex-1 truncate bg-white/10 border border-slate-600 rounded px-1 py-0.5 outline-none text-slate-300 focus:bg-white/20 focus:border-blue-500 transition-colors text-sm"
                             dir="auto"
                             onClick={(e) => e.stopPropagation()}
                             aria-label={t('Rename note')}
                         />
                     ) : (
                     <span
                              className={`flex-1 truncate text-sm ${
                                  syncStatus === 'modified' ? 'text-amber-400' :
                                  syncStatus === 'new' ? 'text-green-400' : ''
                              }`}
                              dir="auto"
                          >
                              {(emoji
                                  ? item.title.replace(emoji, '').trimLeft()
                                  : item.title) ||
                                  (initLoaded ? t('Untitled') : <TextSkeleton />)}
                              {syncStatus === 'modified' && (
                                  <span className="ml-1 text-amber-400 text-xs" title="Modified">M</span>
                              )}
                              {syncStatus === 'new' && (
                                  <span className="ml-1 text-green-400 text-xs" title="New">U</span>
                              )}
                          </span>
                     )}
                 </Link>

                 <IconButton
                     icon="DotsHorizontal"
                     onClick={handleClickMenu}
                     className="p-1 text-slate-600 hover:text-slate-300 rounded transition-colors hidden group-hover:block flex-shrink-0"
                     title={t('Remove, Copy Link, etc')}
                     aria-label={t('Note actions')}
                     tabIndex={-1}
                 ></IconButton>

                 {!hasChildren && (
                     <>
                         <button
                             onClick={openInPane('A')}
                             className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors group-hover:block ${
                                 activePane === 'A' && activeId === item.id
                                     ? 'bg-sky-500/20 text-sky-200'
                                     : 'text-slate-500 hover:bg-white/10 hover:text-slate-200'
                             }`}
                             title="Open in left pane"
                         >
                             L
                         </button>
                         <button
                             onClick={openInPane('B')}
                             className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors group-hover:block ${
                                 activePane === 'B' && activeId === item.id
                                     ? 'bg-sky-500/20 text-sky-200'
                                     : 'text-slate-500 hover:bg-white/10 hover:text-slate-200'
                             }`}
                             title="Open in right pane"
                         >
                             R
                         </button>
                     </>
                 )}

                 <IconButton
                     icon="Plus"
                     onClick={onAddNote}
                     className="p-1 ml-1 text-slate-600 hover:text-slate-300 rounded transition-colors hidden group-hover:block flex-shrink-0"
                     title={t('Add a page inside')}
                     aria-label={t('Add note')}
                     tabIndex={-1}
                 ></IconButton>
             </div>

             {!hasChildren && isExpanded && (
                 <div
                     className={`py-1.5 text-slate-500 select-none ml-${Math.floor((attrs.style?.paddingLeft || 0) / 10)}`}
                 >
                     {initLoaded ? t('No notes inside') : <TextSkeleton />}
                 </div>
             )}
        </>
    );
};

// memo can't compare hook state (syncStatus), so we don't use a custom comparator
// the component will re-render when sync status changes via the zustand subscription
export default SidebarListItem;
