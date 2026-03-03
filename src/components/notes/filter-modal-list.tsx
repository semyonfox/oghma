'use client';

// reusable list for filter modals with keyboard navigation
// ported from Notea (MIT License) - jsx style replaced with Tailwind max-height
import useUIComposite from '@/lib/notes/state/ui';
import { ReactNode, useState } from 'react';
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
    const { ua } = useUIComposite();
    const isMobile = ua?.isMobileOnly;
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

    const maxH = isMobile ? 'calc(100dvh - 40px)' : 'calc(66.67dvh - 40px)';

    return (
        <ul
            className="border-t border-white/5 dark:border-neutral-700 overflow-auto divide-y divide-border-subtle dark:divide-neutral-700"
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
