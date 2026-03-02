// extracted from Notea (MIT License)
// rewritten for react-arborist v3.4.3 + Tailwind (no MUI)
import { Tree } from 'react-arborist';
import IconButton from '@/components/icon-button';
import TreeActions, { ROOT_ID, HierarchicalTreeItemModel, DEFAULT_TREE } from '@/lib/notes/types/tree';
import useI18n from '@/lib/notes/hooks/use-i18n';
import NoteTreeState from '@/lib/notes/state/tree';
import React, { FC, useCallback, useMemo, useState } from 'react';
import SidebarListItem from './sidebar-list-item';
import { makeHierarchy } from '@/lib/notes/types/tree';
import type { NodeRendererProps } from 'react-arborist';
import { NoteModel } from '@/lib/notes/types/note';

export const Favorites: FC = () => {
    const { t } = useI18n();
    const { pinnedTree } = NoteTreeState.useContainer(); // Removed premature logging

console.log('Pinned Tree:', pinnedTree);
    const [tree, setTree] = useState(pinnedTree || DEFAULT_TREE);
    const [isFold, setFold] = useState(false);
    const mergedTree = useMemo(() => {
        const items = JSON.parse(JSON.stringify(pinnedTree.items));
        const baseTree = tree || pinnedTree;

        for (const itemId in items) {
            const item = items[itemId];
            if (item) {
                item.isExpanded = baseTree.items[item.id]?.isExpanded ?? false;
            }
        }

        return { ...pinnedTree, items };
    }, [pinnedTree, tree]);

    const hasPinned = useMemo(
        () => mergedTree.items[ROOT_ID].children.length,
        [mergedTree]
    );

    // convert flat tree structure to hierarchical format for react-arborist
    const treeData = useMemo(() => {
        const hierarchy = makeHierarchy(mergedTree);
        return hierarchy ? hierarchy.children : [];
    }, [mergedTree]);

    // notification callback: sync react-arborist toggle to local state for persistence
    const onToggle = useCallback((id: string) => {
        setTree((prev) => {
            const item = prev.items[id];
            if (!item) return prev;
            return TreeActions.mutateItem(prev, id, { isExpanded: !item.isExpanded });
        });
    }, []);

    if (!hasPinned) {
        return null;
    }

    return (
        <>
            <div className="group p-2 text-neutral-500 flex items-center sticky top-0 bg-neutral-50 dark:bg-neutral-900 z-10">
                <div className="flex-auto flex items-center">
                    <span>{t('Favorites')}</span>
                </div>
                <IconButton
                    icon="Selector"
                    onClick={() => setFold((prev) => !prev)}
                    className="text-neutral-600 dark:text-neutral-400 invisible group-hover:visible"
                    title={t('Fold Favorites')}
                ></IconButton>
            </div>
            {!isFold ? (
                <div>
                    <Tree<HierarchicalTreeItemModel>
                        data={treeData}
                        openByDefault={false}
                        width="100%"
                        indent={10}
                        rowHeight={36}
                        overscanCount={8}
                        onToggle={onToggle}
                        disableDrag={true}
                        disableDrop={true}
                    >
                        {({ node, style, dragHandle }: NodeRendererProps<HierarchicalTreeItemModel>) => {
                            const nodeData = node.data;
                            return (
                                <div style={style} ref={dragHandle}>
                                    <SidebarListItem
                                        onToggle={() => node.toggle()}
                                        isExpanded={node.isOpen}
                                        innerRef={() => {}}
                                        hasChildren={node.children ? node.children.length > 0 : false}
                                        item={nodeData.data as NoteModel}
                                        snapshot={{
                                            isDragging: false,
                                        }}
                                        style={{
                                            paddingLeft: node.level * 10,
                                        }}
                                    />
                                </div>
                            );
                        }}
                    </Tree>
                </div>
            ) : null}
        </>
    );
};
