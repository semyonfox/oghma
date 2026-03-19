// rewritten for react-complex-tree + Tailwind
import IconButton from '@/components/icon-button';
import TreeActions, { ROOT_ID, DEFAULT_TREE } from '@/lib/notes/types/tree';
import useI18n from '@/lib/notes/hooks/use-i18n';
import useNoteTreeStore from '@/lib/notes/state/tree';
import React, { FC, useCallback, useMemo, useState } from 'react';
import SidebarListItem from './sidebar-list-item';
import { ControlledTreeEnvironment, Tree, TreeItemIndex } from 'react-complex-tree';
import 'react-complex-tree/lib/style.css';
import { NoteModel } from '@/lib/notes/types/note';

export const Favorites: FC = () => {
    const { t } = useI18n();
    const { pinnedTree } = useNoteTreeStore();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isFold, setFold] = useState(false);

    // convert flat tree to react-complex-tree format
    const treeData = useMemo(() => {
        const result: Record<string, any> = {};

        // Add root
        const root = pinnedTree.items['root'];
        if (root) {
            result['root'] = {
                index: 'root',
                canMove: false,
                children: root.children,
            };
        }

        // Add all other pinned items
        for (const id in pinnedTree.items) {
            if (id === 'root') continue;
            const item = pinnedTree.items[id];
            if (!item) continue;

            result[id] = {
                index: id,
                canMove: false,
                children: item.children,
                data: item.data,
            };
        }

        return result;
    }, [pinnedTree]);

    const hasPinned = useMemo(
        () => pinnedTree.items[ROOT_ID]?.children.length > 0,
        [pinnedTree]
    );

    const viewState = useMemo(
        () => ({
            'favorites-tree': {
                expandedItems: Array.from(expandedIds) as TreeItemIndex[],
                selectedItems: [],
            },
        }),
        [expandedIds]
    );

    const handleToggleExpanded = useCallback((item: any) => {
        const itemId = item.index;
        if (typeof itemId === 'string') {
            const newExpandedIds = new Set(expandedIds);
            if (expandedIds.has(itemId)) {
                newExpandedIds.delete(itemId);
            } else {
                newExpandedIds.add(itemId);
            }
            setExpandedIds(newExpandedIds);
        }
    }, [expandedIds]);

    if (!hasPinned) {
        return null;
    }

    return (
        <>
            <div className="group p-2 text-text-tertiary flex items-center sticky top-0 bg-background z-10">
                <div className="flex-auto flex items-center">
                    <span>{t('Favorites')}</span>
                </div>
                <IconButton
                    icon="Selector"
                    onClick={() => setFold((prev) => !prev)}
                    className="text-text-tertiary invisible group-hover:visible"
                    title={t('Fold Favorites')}
                />
            </div>
            {!isFold ? (
                <div>
                    <ControlledTreeEnvironment
                        items={treeData}
                        getItemTitle={(item) => item.data?.title ?? 'Untitled'}
                        viewState={viewState}
                        onExpandItem={(item) => handleToggleExpanded(item)}
                        onCollapseItem={(item) => handleToggleExpanded(item)}
                        canDragAndDrop={false}
                    >
                        <Tree
                            treeId="favorites-tree"
                            rootItem="root"
                            treeLabel={t('Favorites')}
                            renderItem={({ item, children, arrow, context }) => {
                                const nodeData = item.data as any;
                                const hasChildren = !!(item.children && item.children.length > 0);

                                return (
                                    <div
                                        {...context.itemContainerWithChildrenProps}
                                        className="flex flex-col"
                                    >
                                        <div
                                            {...context.itemContainerWithoutChildrenProps}
                                            className="flex items-center gap-1 px-2 py-1"
                                        >
                                            {arrow}
                                            <SidebarListItem
                                                onToggle={() => handleToggleExpanded(item)}
                                                isExpanded={expandedIds.has(item.index as string)}
                                                innerRef={() => {}}
                                                hasChildren={hasChildren}
                                                item={
                                                    nodeData ?? ({
                                                        id: item.index,
                                                        title: 'Untitled',
                                                        deleted: 0,
                                                        shared: 0,
                                                        pinned: 1,
                                                        editorsize: null,
                                                    } as NoteModel)
                                                }
                                                snapshot={{
                                                    isDragging: false,
                                                }}
                                                style={{
                                                    paddingLeft: 0,
                                                }}
                                            />
                                        </div>
                                        {children}
                                    </div>
                                );
                            }}
                        />
                    </ControlledTreeEnvironment>
                </div>
            ) : null}
        </>
    );
};
