'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    DocumentDuplicateIcon,
    TrashIcon,
    PencilIcon,
    FolderPlusIcon,
    DocumentPlusIcon,
    StarIcon,
    Squares2X2Icon,
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
    onOpenInSplit: (id: string) => void;
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
    onOpenInSplit,
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
        
        // Exact menu dimensions
        const menuWidth = 192; // w-48
        const menuHeight = 320; // better estimate
        const padding = 8;
        
        let x = e.clientX;
        let y = e.clientY;
        
        // Adjust if menu would overflow right - position LEFT of cursor instead
        if (x + menuWidth > viewportWidth - padding) {
            x = Math.max(padding, x - menuWidth);
        }
        
        // Adjust if menu would overflow bottom - position ABOVE cursor instead  
        if (y + menuHeight > viewportHeight - padding) {
            y = Math.max(padding, y - menuHeight - 4); // -4 to account for small gap above
        }
        
        // If positioned to the left, add small offset so it doesn't hide the cursor
        if (e.clientX + menuWidth > viewportWidth - padding) {
            x = Math.max(padding, x - 8);
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

                    {noteId !== 'root' && (
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
                    )}

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

                    {(isFolder || noteId === 'root') && (
                        <>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateNote(noteId === 'root' ? 'root' : noteId);
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
                                    onCreateFolder(noteId === 'root' ? 'root' : noteId);
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

                    {!isFolder && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenInSplit(noteId);
                                handleClose();
                            }}
                            className="group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <Squares2X2Icon
                                className="mr-3 h-4 w-4"
                                aria-hidden="true"
                            />
                            Open in split right
                        </button>
                    )}

                    {noteId !== 'root' && (
                        <>
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
                        </>
                    )}
                </div>
            )}
        </>
    );
}
