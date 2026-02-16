'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    DocumentDuplicateIcon,
    TrashIcon,
    PencilIcon,
    FolderPlusIcon,
    DocumentPlusIcon,
    StarIcon,
} from '@heroicons/react/24/outline';

interface NoteContextMenuProps {
    noteId: string;
    isFolder: boolean;
    isPinned: boolean;
    onRename: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onTogglePin: (id: string) => void;
    onCreateNote: (parentId: string) => void;
    onCreateFolder: (parentId: string) => void;
    children: React.ReactNode;
}

export default function NoteContextMenu({
    noteId,
    isFolder,
    isPinned,
    onRename,
    onDelete,
    onDuplicate,
    onTogglePin,
    onCreateNote,
    onCreateFolder,
    children,
}: NoteContextMenuProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setPosition({ x: e.clientX, y: e.clientY });
        setIsVisible(true);
    }, []);

    const handleClose = useCallback(() => {
        setIsVisible(false);
    }, []);

    // close on click outside
    useEffect(() => {
        const handleClick = () => handleClose();
        const handleScroll = () => handleClose();
        
        if (isVisible) {
            document.addEventListener('click', handleClick);
            document.addEventListener('scroll', handleScroll, true);
            return () => {
                document.removeEventListener('click', handleClick);
                document.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [isVisible, handleClose]);

    // close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        
        if (isVisible) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isVisible, handleClose]);

    return (
        <>
            <div onContextMenu={handleContextMenu}>
                {children}
            </div>

            {isVisible && (
                <div
                    ref={menuRef}
                    className="fixed z-50 w-48 rounded-md bg-white dark:bg-neutral-800 py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none"
                    style={{
                        top: `${position.y}px`,
                        left: `${position.x}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {!isFolder && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onTogglePin(noteId);
                                handleClose();
                            }}
                            className="group flex w-full items-center px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                            <StarIcon
                                className={`mr-3 h-4 w-4 ${isPinned ? 'fill-yellow-400 text-yellow-400' : ''}`}
                                aria-hidden="true"
                            />
                            {isPinned ? 'Unpin' : 'Pin to Favorites'}
                        </button>
                    )}

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRename(noteId);
                            handleClose();
                        }}
                        className="group flex w-full items-center px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    >
                        <PencilIcon
                            className="mr-3 h-4 w-4"
                            aria-hidden="true"
                        />
                        Rename
                    </button>

                    {!isFolder && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDuplicate(noteId);
                                handleClose();
                            }}
                            className="group flex w-full items-center px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                            <DocumentDuplicateIcon
                                className="mr-3 h-4 w-4"
                                aria-hidden="true"
                            />
                            Duplicate
                        </button>
                    )}

                    {isFolder && (
                        <>
                            <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateNote(noteId);
                                    handleClose();
                                }}
                                className="group flex w-full items-center px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            >
                                <DocumentPlusIcon
                                    className="mr-3 h-4 w-4"
                                    aria-hidden="true"
                                />
                                New Note
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateFolder(noteId);
                                    handleClose();
                                }}
                                className="group flex w-full items-center px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            >
                                <FolderPlusIcon
                                    className="mr-3 h-4 w-4"
                                    aria-hidden="true"
                                />
                                New Folder
                            </button>
                        </>
                    )}

                    <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(noteId);
                            handleClose();
                        }}
                        className="group flex w-full items-center px-4 py-2 text-sm text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20"
                    >
                        <TrashIcon
                            className="mr-3 h-4 w-4"
                            aria-hidden="true"
                        />
                        Delete
                    </button>
                </div>
            )}
        </>
    );
}
