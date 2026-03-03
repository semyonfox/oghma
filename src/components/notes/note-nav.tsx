'use client';

// note navigation bar - breadcrumbs, share, menu, editor width
// ported from Notea (MIT License) - MUI Breadcrumbs/Tooltip/CircularProgress replaced with Tailwind
import useNoteStore from '@/lib/notes/state/note';
import useUIComposite from '@/lib/notes/state/ui';
import { useCallback, MouseEvent, FC, useMemo } from 'react';
import useNoteTreeStore from '@/lib/notes/state/tree';
import usePortalStore from '@/lib/notes/state/portal';
import { NOTE_SHARED } from '@/lib/notes/types/meta';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { useIsLoading, useNoteId } from '@/lib/notes/hooks/use-note-selectors';
import { Breadcrumb } from '@/components/breadcrumb';
import {
    Bars3Icon,
    ShareIcon,
    EllipsisHorizontalIcon,
    EyeIcon,
    ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';

const MenuButton: FC = () => {
    const { sidebar } = useUIComposite();

    const onToggle = useCallback(
        (e: MouseEvent) => {
            e.stopPropagation();
            sidebar.toggle?.();
        },
        [sidebar]
    );

    return (
        <button
            onClick={onToggle}
            className="p-2 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-neutral-300 dark:active:bg-neutral-600 transition-colors mr-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
        >
            <Bars3Icon className="w-5 h-5" aria-hidden="true" />
        </button>
    );
};

const NoteNav: FC = () => {
    const { t } = useI18n();
    const { note } = useNoteStore();
    // Using selector hooks (Phase 1 pattern) - prevents unnecessary re-renders when other state changes
    const loading = useIsLoading();
    const noteId = useNoteId();
    const { ua } = useUIComposite();
    const { getPaths, showItem, checkItemIsShown } = useNoteTreeStore();
    const { share, menu, editorWidthSelect } = usePortalStore();

    const handleClickShare = useCallback(
        (event: MouseEvent) => {
            share.setData(note);
            share.setAnchor(event.target as Element);
            share.open();
        },
        [note, share]
    );

    const handleClickMenu = useCallback(
        (event: MouseEvent) => {
            menu.setData(note);
            menu.setAnchor(event.target as Element);
            menu.open();
        },
        [note, menu]
    );

    const handleClickEditorWidth = useCallback(
        (event: MouseEvent) => {
            editorWidthSelect.setData(note);
            editorWidthSelect.setAnchor(event.target as Element);
            editorWidthSelect.open();
        },
        [note, editorWidthSelect]
    );

    const handleClickOpenInTree = useCallback(() => {
        if (!note) return;
        showItem(note);
    }, [note, showItem]);

    // Memoize paths calculation to prevent cascading updates
    const paths = useMemo(() => {
        return note ? getPaths(note).reverse() : [];
    }, [note, getPaths]);

    // Memoize breadcrumb pages array
    const breadcrumbPages = useMemo(() => {
        if (!note) return [];
        return [
            ...paths.map((path) => ({
                name: path.title,
                href: `/${path.id}`,
                current: false,
            })),
            {
                name: note.title,
                href: `/${note.id}`,
                current: true,
            }
        ];
    }, [paths, note]);

    const isShown = useMemo(() => {
        return note ? checkItemIsShown(note) : true;
    }, [note, checkItemIsShown]);

    return (
        <nav
            className={`flex items-center gap-2 flex-1 min-w-0 ${
                ua?.isMobileOnly ? 'w-full' : ''
            }`}
            style={{
                width: ua?.isMobileOnly ? '100%' : 'inherit',
            }}
            aria-label="Note actions and navigation"
        >
            {ua?.isMobileOnly && <MenuButton />}

             {/* breadcrumbs */}
             <div className="flex-auto ml-4 min-w-0">
                 {note && (
                     <>
                         <Breadcrumb 
                             homeHref="/"
                             pages={breadcrumbPages}
                         />
                        {!isShown && (
                            <button
                                onClick={handleClickOpenInTree}
                                className="inline-flex ml-2 p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                                title={t('Show note in tree')}
                                aria-label={t('Show note in tree')}
                            >
                                 <EyeIcon className="w-4 h-4 text-gray-500" aria-hidden="true" />
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* loading indicator */}
            <div
                className={`flex shrink-0 transition-opacity duration-100 ${
                    loading ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            </div>

            {/* action buttons */}
            <button
                onClick={handleClickShare}
                disabled={!note}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary-500"
                title={t('Share page')}
                aria-label={t('Share page')}
            >
                <ShareIcon
                    className={`w-4 h-4 ${
                        note?.shared === NOTE_SHARED.PUBLIC
                            ? 'text-indigo-500'
                            : 'text-gray-400'
                    }`}
                    aria-hidden="true"
                />
            </button>

            <button
                onClick={handleClickEditorWidth}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500"
                title={t('Editor width')}
                aria-label={t('Editor width')}
            >
                <ArrowsPointingOutIcon className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>

            <button
                disabled={!note}
                onClick={handleClickMenu}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary-500"
                title={t('Settings')}
                aria-label={t('Settings')}
            >
                <EllipsisHorizontalIcon className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </button>
        </nav>
    );
};

export default NoteNav;
