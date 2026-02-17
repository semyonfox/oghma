'use client';

// note navigation bar - breadcrumbs, share, menu, editor width
// ported from Notea (MIT License) - MUI Breadcrumbs/Tooltip/CircularProgress replaced with Tailwind
import NoteState from '@/lib/notes/state/note';
import UIState from '@/lib/notes/state/ui';
import { useCallback, MouseEvent, FC, useMemo } from 'react';
import NoteTreeState from '@/lib/notes/state/tree';
import PortalState from '@/lib/notes/state/portal';
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
    const { sidebar } = UIState.useContainer();

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
            className="p-2 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-neutral-300 dark:active:bg-neutral-600 transition-colors mr-2"
        >
            <Bars3Icon className="w-5 h-5" />
        </button>
    );
};

const NoteNav: FC = () => {
    const { t } = useI18n();
    const { note } = NoteState.useContainer();
    // Using selector hooks (Phase 1 pattern) - prevents unnecessary re-renders when other state changes
    const loading = useIsLoading();
    const noteId = useNoteId();
    const { ua } = UIState.useContainer();
    const { getPaths, showItem, checkItemIsShown } = NoteTreeState.useContainer();
    const { share, menu, editorWidthSelect } = PortalState.useContainer();

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
    }, [note?.id, getPaths]);

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
    }, [paths, note?.title, note?.id]);

    const isShown = useMemo(() => {
        return note ? checkItemIsShown(note) : true;
    }, [note?.id, checkItemIsShown]);

    return (
        <nav
            className={`flex items-center gap-2 flex-1 min-w-0 ${
                ua?.isMobileOnly ? 'w-full' : ''
            }`}
            style={{
                width: ua?.isMobileOnly ? '100%' : 'inherit',
            }}
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
                                className="inline-flex ml-2 p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                title={t('Show note in tree')}
                            >
                                 <EyeIcon className="w-4 h-4 text-gray-500" />
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
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0 disabled:opacity-40"
                title={t('Share page')}
            >
                <ShareIcon
                    className={`w-4 h-4 ${
                        note?.shared === NOTE_SHARED.PUBLIC
                            ? 'text-indigo-500'
                            : 'text-gray-400'
                    }`}
                />
            </button>

            <button
                onClick={handleClickEditorWidth}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0"
                title={t('Editor width')}
            >
                <ArrowsPointingOutIcon className="w-4 h-4 text-gray-400" />
            </button>

            <button
                disabled={!note}
                onClick={handleClickMenu}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shrink-0 disabled:opacity-40"
                title={t('Settings')}
            >
                <EllipsisHorizontalIcon className="w-4 h-4 text-gray-400" />
            </button>
        </nav>
    );
};

export default NoteNav;
