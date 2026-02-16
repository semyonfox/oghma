'use client';

// reusable list for filter modals with keyboard navigation
// ported from Notea (MIT License) - jsx style replaced with Tailwind max-height
import UIState from '@/lib/notes/state/ui';
import { ReactNode, useState } from 'react';
import { use100vh } from 'react-div-100vh';
import { useHotkeys } from 'react-hotkeys-hook';

interface ItemProps {
    selected: boolean;
}

interface Props<T> {
    ItemComponent: (item: T, props: ItemProps) => ReactNode;
    items: T[];
    onEnter?: (item: T) => void;
}

export default function FilterModalList<T>({
    ItemComponent,
    items,
    onEnter,
}: Props<T>) {
    const { ua } = UIState.useContainer();
    const isMobile = ua?.isMobileOnly;
    const height = use100vh() || 0;
    const calcHeight = isMobile ? height : (height * 2) / 3;
    const [selectedIndex, setSelectedIndex] = useState(0);

    useHotkeys(
        'down',
        (event) => {
            event.preventDefault();
            setSelectedIndex((prev) => Math.min((items?.length ?? 1) - 1, prev + 1));
        },
        { enableOnFormTags: ['INPUT'] }
    );

    useHotkeys(
        'up',
        (event) => {
            event.preventDefault();
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        },
        { enableOnFormTags: ['INPUT'] }
    );

    useHotkeys(
        'enter',
        (event) => {
            event.preventDefault();
            if (items?.[selectedIndex]) {
                onEnter?.(items[selectedIndex]);
            }
        },
        { enableOnFormTags: ['INPUT'] }
    );

    if (!items?.length) {
        return null;
    }

    const maxH = calcHeight ? `${calcHeight - 40}px` : 'calc(100vh - 40px)';

    return (
        <ul
            className="border-t border-border-subtle dark:border-neutral-700 overflow-auto divide-y divide-border-subtle dark:divide-neutral-700"
            style={{ maxHeight: maxH }}
        >
            {items.map((item, index) =>
                ItemComponent(item, {
                    selected: selectedIndex === index,
                })
            )}
        </ul>
    );
}
