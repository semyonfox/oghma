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
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Estimate menu dimensions
        const menuWidth = 192; // w-48 = 12rem = 192px
        const menuHeight = 300; // approximate
        const padding = 8;
        
        let x = e.clientX;
        let y = e.clientY;
        
        // If menu would overflow right, position it to the LEFT of cursor
        if (x + menuWidth > viewportWidth - padding) {
            x = Math.max(padding, x - menuWidth);
        }
        
        // If menu would overflow bottom, position it ABOVE cursor
        if (y + menuHeight > viewportHeight - padding) {
            y = Math.max(padding, y - menuHeight);
        }
        
        setPosition({ x, y });
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
                    className="fixed z-[9999] w-48 rounded-md bg-white dark:bg-gray-800 py-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10 focus:outline-none backdrop-blur-sm"
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
                            className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                        className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                            className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateNote(noteId);
                                    handleClose();
                                }}
                                className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                                className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <FolderPlusIcon
                                    className="mr-3 h-4 w-4"
                                    aria-hidden="true"
                                />
                                New Folder
                            </button>
                        </>
                    )}

                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

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
