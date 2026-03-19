'use client';

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    DocumentDuplicateIcon,
    TrashIcon,
    PencilIcon,
    FolderPlusIcon,
    DocumentPlusIcon,
    StarIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline';
import useI18n from '@/lib/notes/hooks/use-i18n';
import useContextMenuStore from '@/lib/notes/state/context-menu';

interface NoteContextMenuPortalProps {
    onRename: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onTogglePin: (id: string) => void;
    onCreateNote: (parentId: string) => void;
    onCreateFolder: (parentId: string) => void;
    onOpenInSplit: (id: string) => void;
}

export default function NoteContextMenuPortal({
    onRename,
    onDelete,
    onDuplicate,
    onTogglePin,
    onCreateNote,
    onCreateFolder,
    onOpenInSplit,
}: NoteContextMenuPortalProps) {
    const { t } = useI18n();
    const { openMenuId, position, isFolder, isPinned, closeMenu } = useContextMenuStore();

    // close on click outside
    useEffect(() => {
        if (!openMenuId) return;
        
        const handleClick = () => closeMenu();
        const handleScroll = () => closeMenu();
        
        document.addEventListener('click', handleClick);
        document.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('click', handleClick);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, [openMenuId, closeMenu]);

    // close on escape
    useEffect(() => {
        if (!openMenuId) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeMenu();
        };
        
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [openMenuId, closeMenu]);

    if (!openMenuId) return null;

    const handleMenuClick = (callback: () => void) => {
        callback();
        closeMenu();
    };

    return createPortal(
        <div
            className="fixed z-[9999] w-48 rounded-md bg-surface py-1 shadow-xl ring-1 ring-border focus:outline-none backdrop-blur-sm"
            style={{
                top: `${position.y}px`,
                left: `${position.x}px`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {!isFolder && (
                <button
                    onClick={() => handleMenuClick(() => onTogglePin(openMenuId))}
                    className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                >
                    <StarIcon
                        className={`mr-3 h-4 w-4 ${isPinned ? 'fill-yellow-400 text-yellow-400' : ''}`}
                        aria-hidden="true"
                    />
                    {isPinned ? t('Unpin') : t('Pin to Favorites')}
                </button>
            )}

            <button
                onClick={() => handleMenuClick(() => onRename(openMenuId))}
                className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
            >
                <PencilIcon
                    className="mr-3 h-4 w-4"
                    aria-hidden="true"
                />
                {t('Rename')}
            </button>

            {!isFolder && (
                <button
                    onClick={() => handleMenuClick(() => onDuplicate(openMenuId))}
                        className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                    >
                        <DocumentDuplicateIcon
                        className="mr-3 h-4 w-4"
                        aria-hidden="true"
                    />
                    {t('Duplicate')}
                </button>
            )}

            {(isFolder || openMenuId === 'root') && (
                <>
                    <div className="my-1 border-t border-border-subtle" />
                    <button
                        onClick={() => handleMenuClick(() => onCreateNote(openMenuId === 'root' ? 'root' : openMenuId))}
                        className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                    >
                        <DocumentPlusIcon
                            className="mr-3 h-4 w-4"
                            aria-hidden="true"
                        />
                        {t('New Note')}
                    </button>
                    <button
                        onClick={() => handleMenuClick(() => onCreateFolder(openMenuId === 'root' ? 'root' : openMenuId))}
                        className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                    >
                        <FolderPlusIcon
                            className="mr-3 h-4 w-4"
                            aria-hidden="true"
                        />
                        {t('New Folder')}
                    </button>
                </>
            )}

            <div className="my-1 border-t border-border-subtle" />

            {!isFolder && (
                <button
                    onClick={() => handleMenuClick(() => onOpenInSplit(openMenuId))}
                    className="group flex w-full items-center px-4 py-2 text-sm text-text-secondary hover:bg-surface-elevated"
                >
                    <Squares2X2Icon
                        className="mr-3 h-4 w-4"
                        aria-hidden="true"
                    />
                    {t('Open in split right')}
                </button>
            )}

            <div className="my-1 border-t border-border-subtle" />

            <button
                onClick={() => handleMenuClick(() => onDelete(openMenuId))}
                className="group flex w-full items-center px-4 py-2 text-sm text-error-400 hover:bg-error-900/20"
            >
                <TrashIcon
                    className="mr-3 h-4 w-4"
                    aria-hidden="true"
                />
                {t('Delete')}
            </button>
        </div>,
        document.body
    );
}
