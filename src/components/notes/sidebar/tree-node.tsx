'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import useNoteTreeStore from '@/lib/notes/state/tree';
import useNoteStore from '@/lib/notes/state/note';
import useLayoutStore from '@/lib/notes/state/layout.zustand';
import useContextMenuStore from '@/lib/notes/state/context-menu';
import useSyncStatusStore from '@/lib/notes/state/sync-status';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { buildFileSpec } from '@/lib/notes/utils/file-spec';
import { NOTE_PINNED } from '@/lib/notes/types/meta';
import { TreeItemModel } from '@/lib/notes/types/tree';
import { NoteModel } from '@/lib/notes/types/note';

const INDENT = 14; // px per depth level

// folders first (alpha), then files (alpha)
export function sortedChildren(
    items: Record<string, TreeItemModel>,
    parentId: string
): string[] {
    const children = items[parentId]?.children ?? [];
    return [...children].sort((a, b) => {
        const ia = items[a];
        const ib = items[b];
        const af = !!(ia?.isFolder || ia?.data?.isFolder);
        const bf = !!(ib?.isFolder || ib?.data?.isFolder);
        if (af !== bf) return af ? -1 : 1;
        const ta = (ia?.data?.title ?? '').toLowerCase();
        const tb = (ib?.data?.title ?? '').toLowerCase();
        return ta.localeCompare(tb);
    });
}

interface TreeNodeProps {
    id: string;
    depth: number;
    renamingId: string | null;
    onRenameComplete: (id: string, title: string) => void;
    onRename: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onTogglePin: (id: string) => void;
    onCreateNote: (parentId: string) => void;
    onCreateFolder: (parentId: string) => void;
    onOpenInSplit: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
    id,
    depth,
    renamingId,
    onRenameComplete,
    onRename,
    onDelete,
    onDuplicate,
    onTogglePin,
    onCreateNote,
    onCreateFolder,
    onOpenInSplit,
}) => {
    const { t } = useI18n();
    const pathname = usePathname();

    const { tree, mutateItem, loadChildren, expandedIds, setExpandedIds, initLoaded } =
        useNoteTreeStore();
    const { createNote, mutateNote } = useNoteStore();
    const { setPaneA, setActivePane } = useLayoutStore();
    const syncStatus = useSyncStatusStore((s) => s.status[id]);

    const item = tree.items[id];
    const data = item?.data as NoteModel | undefined;
    const isFolder = !!(item?.isFolder || data?.isFolder);
    const isExpanded = expandedIds.has(id);
    const isLoading = !!item?.isChildrenLoading;
    const isRenaming = renamingId === id;

    const [renameValue, setRenameValue] = useState(data?.title ?? '');
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isRenaming) setRenameValue(data?.title ?? '');
    }, [data?.title, isRenaming]);

    useEffect(() => {
        if (isRenaming) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [isRenaming]);

    const activeNoteId = useMemo(() => {
        if (!pathname) return null;
        const segs = pathname.split('/').filter(Boolean);
        return segs[0] === 'notes' ? (segs[1] ?? null) : (segs[0] ?? null);
    }, [pathname]);

    const isActive = activeNoteId === id;

    const href = useMemo(() => {
        if (isFolder) return '#';
        return pathname?.startsWith('/notes') ? `/notes/${id}` : `/${id}`;
    }, [isFolder, id, pathname]);

    const handleToggle = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isFolder) return;
            const next = !isExpanded;
            const s = new Set(expandedIds);
            next ? s.add(id) : s.delete(id);
            setExpandedIds(s);
            mutateItem(id, { isExpanded: next });
            if (next && !item?.childrenLoaded) loadChildren(id);
        },
        [isFolder, isExpanded, expandedIds, setExpandedIds, mutateItem, id, loadChildren, item?.childrenLoaded]
    );

    const handleRowClick = useCallback(
        (e: React.MouseEvent) => {
            if (isFolder) {
                handleToggle(e);
            } else {
                if (data) {
                    setPaneA(buildFileSpec(data));
                    setActivePane('A');
                }
            }
        },
        [isFolder, handleToggle, data, setPaneA, setActivePane]
    );

    const showContextMenu = useCallback(
        (x: number, y: number) => {
            const mw = 192, mh = 320, pad = 8;
            if (x + mw > window.innerWidth - pad) x = Math.max(pad, x - mw);
            if (y + mh > window.innerHeight - pad) y = Math.max(pad, y - mh - 4);
            useContextMenuStore
                .getState()
                .setOpenMenu(id, x, y, isFolder, data?.pinned === NOTE_PINNED.PINNED);
        },
        [id, isFolder, data?.pinned]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        },
        [showContextMenu]
    );

    const handleDotsClick = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            showContextMenu(rect.left, rect.bottom + 4);
        },
        [showContextMenu]
    );

    const handleAddNote = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onCreateNote(id);
        },
        [id, onCreateNote]
    );

    const handleRenameSubmit = useCallback(() => {
        onRenameComplete(id, renameValue.trim() || data?.title || '');
    }, [id, renameValue, data?.title, onRenameComplete]);

    const children = sortedChildren(tree.items, id);
    const pl = depth * INDENT;

    if (!item) return null;

    return (
        <div>
            {/* Row */}
            <div
                className={`group flex items-center h-[26px] pr-1 rounded-sm cursor-pointer select-none transition-colors duration-100 ${
                    isActive
                        ? 'bg-primary-500/10 text-primary-400'
                        : 'text-text-tertiary hover:text-text-secondary hover:bg-white/5'
                }`}
                style={{ paddingLeft: `${pl + 4}px` }}
                onClick={handleRowClick}
                onContextMenu={handleContextMenu}
                role={isFolder ? 'button' : 'link'}
                aria-expanded={isFolder ? isExpanded : undefined}
                aria-current={isActive ? 'page' : undefined}
            >
                {/* Chevron / dot */}
                <span
                    className="flex-shrink-0 flex items-center justify-center w-4 h-4 mr-0.5"
                    style={
                        isFolder
                            ? { transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }
                            : undefined
                    }
                    onClick={isFolder ? handleToggle : undefined}
                >
                    {isFolder ? (
                        isLoading ? (
                            <svg
                                className="animate-spin w-3 h-3 text-text-tertiary"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                        ) : (
                            <svg
                                className="w-3 h-3 text-text-tertiary group-hover:text-text-secondary"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        )
                    ) : (
                            <svg
                                className="w-1 h-1 text-text-tertiary opacity-60"
                            viewBox="0 0 6 6"
                            fill="currentColor"
                        >
                            <circle cx="3" cy="3" r="3" />
                        </svg>
                    )}
                </span>

                {/* Title / rename input */}
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameSubmit();
                            } else if (e.key === 'Escape') {
                                setRenameValue(data?.title ?? '');
                                onRenameComplete(id, data?.title ?? '');
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 truncate bg-white/10 border border-border rounded px-1 outline-none text-text focus:bg-white/15 focus:border-primary-500 text-sm"
                    />
                ) : (
                    <a
                        href={isFolder ? undefined : href}
                        className={`flex-1 min-w-0 truncate text-sm font-normal leading-none ${
                            isFolder ? 'font-medium' : ''
                        } ${
                            syncStatus === 'modified'
                                ? 'text-amber-400'
                                : syncStatus === 'new'
                                ? 'text-green-400'
                                : syncStatus === 'canvas_new'
                                ? 'text-blue-400'
                                : ''
                        }`}
                        onClick={(e) => {
                            if (isFolder) e.preventDefault();
                        }}
                        tabIndex={-1}
                    >
                        {data?.title || (initLoaded ? t('Untitled') : '…')}
                    </a>
                )}

                {/* Sync indicator dot */}
                {!isRenaming && (syncStatus === 'modified' || syncStatus === 'new' || syncStatus === 'canvas_new') && (
                    <span
                        className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ml-1 ${
                            syncStatus === 'modified' ? 'bg-amber-400'
                            : syncStatus === 'canvas_new' ? 'bg-blue-400'
                            : 'bg-green-400'
                        }`}
                    />
                )}

                {/* Hover action buttons */}
                {!isRenaming && (
                    <span className="flex-shrink-0 flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                        <button
                            className="p-0.5 rounded hover:bg-white/10 text-text-tertiary hover:text-text-secondary transition-colors"
                            onClick={handleDotsClick}
                            title={t('More actions')}
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                            </svg>
                        </button>
                        {isFolder && (
                            <button
                                className="p-0.5 rounded hover:bg-white/10 text-text-tertiary hover:text-text-secondary transition-colors"
                                onClick={handleAddNote}
                                title={t('New note')}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                        )}
                    </span>
                )}
            </div>

            {/* Children */}
            {isFolder && isExpanded && (
                <div className="relative">
                    {/* Indent guide line */}
                    <div
                        className="absolute top-0 bottom-0 w-px bg-white/[0.04] pointer-events-none"
                        style={{ left: `${pl + 11}px` }}
                    />
                    {children.length === 0 && item.childrenLoaded && !isLoading && (
                        <div
                            className="h-6 flex items-center text-xs text-text-tertiary select-none italic"
                            style={{ paddingLeft: `${pl + INDENT + 4}px` }}
                        >
                            {t('No notes inside')}
                        </div>
                    )}
                    {children.map((childId) => (
                        <TreeNode
                            key={childId}
                            id={childId}
                            depth={depth + 1}
                            renamingId={renamingId}
                            onRenameComplete={onRenameComplete}
                            onRename={onRename}
                            onDelete={onDelete}
                            onDuplicate={onDuplicate}
                            onTogglePin={onTogglePin}
                            onCreateNote={onCreateNote}
                            onCreateFolder={onCreateFolder}
                            onOpenInSplit={onOpenInSplit}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default React.memo(TreeNode);
