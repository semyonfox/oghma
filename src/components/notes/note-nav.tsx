'use client';

// note navigation bar - breadcrumbs, share, menu, editor width
// ported from Notea (MIT License) - MUI Breadcrumbs/Tooltip/CircularProgress replaced with Tailwind
import NoteState from '@/lib/notes/state/note';
import UIState from '@/lib/notes/state/ui';
import { useCallback, MouseEvent, FC } from 'react';
import NoteTreeState from '@/lib/notes/state/tree';
import Link from 'next/link';
import IconButton from '@/components/icon-button';
import PortalState from '@/lib/notes/state/portal';
import { NOTE_SHARED } from '@/lib/notes/types/meta';
import useI18n from '@/lib/notes/hooks/use-i18n';
import {
    Bars3Icon,
    ShareIcon,
    EllipsisHorizontalIcon,
    EyeIcon,
    ArrowsPointingOutIcon,
    ChevronRightIcon,
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
    const { note, loading } = NoteState.useContainer();
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

    const paths = note ? getPaths(note).reverse() : [];
    const isShown = note ? checkItemIsShown(note) : true;

    return (
        <nav
            className={`fixed bg-surface dark:bg-neutral-800 z-10 p-2 flex items-center right-0 ${
                ua?.isMobileOnly ? 'w-full shadow-sm' : ''
            }`}
            style={{
                width: ua?.isMobileOnly ? '100%' : 'inherit',
            }}
        >
            {ua?.isMobileOnly && <MenuButton />}

            {/* breadcrumbs */}
            <div className="flex-auto ml-4 min-w-0">
                {note && (
                    <nav className="flex items-center text-sm leading-none" aria-label="breadcrumb">
                        {paths.map((path, index) => (
                            <span key={path.id} className="flex items-center min-w-0">
                                {index > 0 && (
                                    <ChevronRightIcon className="w-3 h-3 mx-1 text-text-tertiary flex-shrink-0" />
                                )}
                                <Link
                                    href={`/${path.id}`}
                                    className="block hover:bg-neutral-100 dark:hover:bg-neutral-700 px-1 py-0.5 rounded truncate max-w-[120px] text-text-secondary"
                                    title={path.title}
                                >
                                    {path.title}
                                </Link>
                            </span>
                        ))}
                        {paths.length > 0 && (
                            <ChevronRightIcon className="w-3 h-3 mx-1 text-text-tertiary flex-shrink-0" />
                        )}
                        <span className="flex items-center min-w-0">
                            <span
                                className="inline-block text-text-secondary truncate max-w-[120px] select-none align-middle"
                                title={note.title}
                            >
                                {note.title}
                            </span>
                            {!isShown && (
                                <button
                                    onClick={handleClickOpenInTree}
                                    className="inline-flex ml-1 p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                    title={t('Show note in tree')}
                                >
                                    <EyeIcon className="w-4 h-4 text-text-tertiary" />
                                </button>
                            )}
                        </span>
                    </nav>
                )}
            </div>

            {/* loading indicator */}
            <div
                className={`flex mr-2 transition-opacity duration-100 ${
                    loading ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <div className="w-3.5 h-3.5 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin" />
            </div>

            {/* action buttons */}
            <button
                onClick={handleClickShare}
                disabled={!note}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors mr-1 disabled:opacity-40"
                title={t('Share page')}
            >
                <ShareIcon
                    className={`w-4 h-4 ${
                        note?.shared === NOTE_SHARED.PUBLIC
                            ? 'text-primary-500'
                            : 'text-text-secondary'
                    }`}
                />
            </button>

            <button
                onClick={handleClickEditorWidth}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors mr-1"
                title={t('Editor width')}
            >
                <ArrowsPointingOutIcon className="w-4 h-4 text-text-secondary" />
            </button>

            <button
                disabled={!note}
                onClick={handleClickMenu}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-40"
                title={t('Settings')}
            >
                <EllipsisHorizontalIcon className="w-4 h-4 text-text-secondary" />
            </button>
        </nav>
    );
};

export default NoteNav;
