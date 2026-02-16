// extracted from Notea (MIT License)
// rewritten for App Router + react-arborist v3.4.3 + Tailwind (no MUI)
import { NoteModel } from '@/lib/notes/types/note';
import Link from 'next/link';
import { FC, MouseEvent, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import IconButton from '@/components/icon-button';
import NoteTreeState from '@/lib/notes/state/tree';
import PortalState from '@/lib/notes/state/portal';
import useI18n from '@/lib/notes/hooks/use-i18n';
import emojiRegex from 'emoji-regex';

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
    const { mutateItem, initLoaded } = NoteTreeState.useContainer();
    const {
        menu: { open, setData, setAnchor },
    } = PortalState.useContainer();
    const [renameValue, setRenameValue] = useState(item.title || '');
    const renameInputRef = useRef<HTMLInputElement>(null);

    // derive active note id from pathname (e.g. "/abc123" -> "abc123")
    const activeId: string | null = useMemo(() => {
        if (!pathname || pathname === '/') return null;
        // strip leading slash, take first segment
        const segments = pathname.split('/').filter(Boolean);
        return segments[0] || null;
    }, [pathname]);

    // focus input when entering rename mode
    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    const onAddNote = useCallback(
        (e: MouseEvent) => {
            e.preventDefault();
            // navigate to create a new note under this item
            router.push(`/new?pid=${item.id}`);
            mutateItem(item.id, {
                isExpanded: true,
            })
                ?.catch((v) => console.error('Error whilst mutating item: %O', v));
        },
        [item.id, mutateItem, router]
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
            // if it has children (is a folder), toggle expand/collapse
            if (hasChildren) {
                e.preventDefault();
                onToggle();
            }
            // if it's a note (no children), Link handles navigation
        },
        [hasChildren, onToggle]
    );

    const emoji = useMemo(() => {
        const emoji = item.title?.match(emojiRegex());
        if (emoji?.length === 1) return emoji[0];
        return undefined;
    }, [item.title]);

    return (
        <>
            <div
                {...attrs}
                ref={innerRef}
                className={`flex items-center group pr-2 overflow-hidden hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors ${
                    snapshot.isDragging ? 'shadow bg-neutral-200 dark:bg-neutral-800' : ''
                } ${
                    activeId === item.id ? 'bg-neutral-100 dark:bg-neutral-800/50' : ''
                }`}
            >
                <Link 
                    href={hasChildren ? '#' : `/${item.id}`} 
                    className="flex flex-1 items-center truncate px-2 py-1.5"
                    onClick={handleClickItem}
                >
                    {emoji ? (
                        <span
                            onClick={handleClickIcon}
                            className="block p-0.5 cursor-pointer w-7 h-7 md:w-6 md:h-6 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 mr-1 text-center transition-colors"
                        >
                            {emoji}
                        </span>
                    ) : (
                        <IconButton
                            className="mr-1"
                            icon={
                                hasChildren
                                    ? 'ChevronRight'
                                    : item.title
                                    ? 'DocumentText'
                                    : 'Document'
                            }
                            iconClassName={`transition-transform transform ${isExpanded ? 'rotate-90' : ''}`}
                            onClick={handleClickIcon}
                        ></IconButton>
                    )}

                    {isRenaming ? (
                        <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                                if (renameValue.trim() && renameValue !== item.title) {
                                    onRenameComplete?.(renameValue);
                                } else {
                                    onRenameComplete?.(item.title || '');
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (renameValue.trim()) {
                                        onRenameComplete?.(renameValue);
                                    }
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setRenameValue(item.title || '');
                                    onRenameComplete?.(item.title || '');
                                }
                            }}
                            className="flex-1 truncate bg-white dark:bg-neutral-800 border border-primary-500 rounded px-1 outline-none text-neutral-900 dark:text-neutral-100"
                            dir="auto"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="flex-1 truncate" dir="auto">
                            {(emoji
                                ? item.title.replace(emoji, '').trimLeft()
                                : item.title) ||
                                (initLoaded ? t('Untitled') : <TextSkeleton />)}
                        </span>
                    )}
                </Link>

                <IconButton
                    icon="DotsHorizontal"
                    onClick={handleClickMenu}
                    className="hidden group-hover:block"
                    title={t('Remove, Copy Link, etc')}
                ></IconButton>

                <IconButton
                    icon="Plus"
                    onClick={onAddNote}
                    className="ml-1 hidden group-hover:block"
                    title={t('Add a page inside')}
                ></IconButton>
            </div>

            {!hasChildren && isExpanded && (
<div
    className={`py-1.5 text-neutral-400 select-none ml-${Math.floor((attrs.style?.paddingLeft || 0) / 10)}`}
>
                    {initLoaded ? t('No notes inside') : <TextSkeleton />}
                </div>
            )}
        </>
    );
};

export default SidebarListItem;
