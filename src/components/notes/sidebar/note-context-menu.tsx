'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// menu item component for consistency
const MenuItem = ({
    label,
    shortcut,
    icon,
    onClick,
    danger,
}: {
    label: string;
    shortcut?: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
}) => (
    <button
        onClick={onClick}
        className={`flex w-full items-center h-7 px-2 text-[13px] rounded-[3px] mx-0.5 transition-colors ${
            danger
                ? 'text-error-400 hover:bg-error-500/10'
                : 'text-text-secondary hover:bg-white/[0.06]'
        }`}
        style={{ width: 'calc(100% - 4px)' }}
    >
        <span className="flex-shrink-0 w-4 h-4 mr-2.5 flex items-center justify-center opacity-70">
            {icon}
        </span>
        <span className="flex-1 text-left truncate">{label}</span>
        {shortcut && (
            <span className="text-[11px] text-text-tertiary ml-4 flex-shrink-0">{shortcut}</span>
        )}
    </button>
);

const Separator = () => <div className="my-1 mx-2 border-t border-white/[0.06]" />;
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
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);

    // clamp menu position to viewport after it renders and we know its actual size
    useEffect(() => {
        if (!openMenuId) { setAdjusted(null); return; }
        // wait one frame for the menu to render and have dimensions
        const frame = requestAnimationFrame(() => {
            const el = menuRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const pad = 8;
            let x = position.x;
            let y = position.y;
            if (x + rect.width > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - rect.width - pad);
            if (y + rect.height > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - rect.height - pad);
            if (x !== position.x || y !== position.y) setAdjusted({ x, y });
        });
        return () => cancelAnimationFrame(frame);
    }, [openMenuId, position]);

    // close on click outside or scroll
    useEffect(() => {
        if (!openMenuId) return;
        const handleClose = () => closeMenu();
        document.addEventListener('click', handleClose);
        document.addEventListener('scroll', handleClose, true);
        return () => {
            document.removeEventListener('click', handleClose);
            document.removeEventListener('scroll', handleClose, true);
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

    const run = (fn: () => void) => {
        fn();
        closeMenu();
    };

    // svg icons inline for crisp rendering
    const icons = {
        pin: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11.5 3.5l5 5-3 3-1-1-4 4-2.5-2.5 4-4-1-1-3 3" />
                <path d="M6 14l-2.5 2.5" />
            </svg>
        ),
        rename: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-9.5 9.5-3.5 1 1-3.5 9.172-9.828z" />
            </svg>
        ),
        duplicate: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5" y="5" width="11" height="11" rx="1" />
                <path d="M4 15V4a1 1 0 011-1h11" />
            </svg>
        ),
        newNote: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4h8l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
                <path d="M12 4v4h4" />
            </svg>
        ),
        newFolder: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5z" />
            </svg>
        ),
        split: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="16" height="14" rx="1" />
                <line x1="10" y1="3" x2="10" y2="17" />
            </svg>
        ),
        trash: (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 6h10M8 6V4h4v2M6 6v10a1 1 0 001 1h6a1 1 0 001-1V6" />
            </svg>
        ),
    };

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[180px] rounded-md bg-surface/95 backdrop-blur-md py-1 shadow-2xl ring-1 ring-white/[0.08]"
            style={{
                top: `${(adjusted ?? position).y}px`,
                left: `${(adjusted ?? position).x}px`,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {!isFolder && (
                <MenuItem
                    label={isPinned ? t('Unpin') : t('Pin to favorites')}
                    icon={icons.pin}
                    onClick={() => run(() => onTogglePin(openMenuId))}
                />
            )}

            <MenuItem
                label={t('Rename')}
                shortcut="F2"
                icon={icons.rename}
                onClick={() => run(() => onRename(openMenuId))}
            />

            {!isFolder && (
                <MenuItem
                    label={t('Duplicate')}
                    icon={icons.duplicate}
                    onClick={() => run(() => onDuplicate(openMenuId))}
                />
            )}

            {(isFolder || openMenuId === 'root') && (
                <>
                    <Separator />
                    <MenuItem
                        label={t('New note')}
                        icon={icons.newNote}
                        onClick={() => run(() => onCreateNote(openMenuId === 'root' ? 'root' : openMenuId))}
                    />
                    <MenuItem
                        label={t('New folder')}
                        icon={icons.newFolder}
                        onClick={() => run(() => onCreateFolder(openMenuId === 'root' ? 'root' : openMenuId))}
                    />
                </>
            )}

            {!isFolder && (
                <>
                    <Separator />
                    <MenuItem
                        label={t('Open in split view')}
                        icon={icons.split}
                        onClick={() => run(() => onOpenInSplit(openMenuId))}
                    />
                </>
            )}

            <Separator />

            <MenuItem
                label={t('Delete')}
                icon={icons.trash}
                onClick={() => run(() => onDelete(openMenuId))}
                danger
            />
        </div>,
        document.body
    );
}
