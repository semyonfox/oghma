'use client';

// preview modal - shows note preview on hover/click
// ported from Notea (MIT License) - MUI Popover replaced with Tailwind floating panel
import { FC } from 'react';
import usePortalStore from '@/lib/notes/state/portal';
import noteCache from '@/lib/notes/cache/note';
import Link from 'next/link';
import { useSWR } from '@/lib/notes/hooks/use-swr';

const PreviewModal: FC = () => {
    const { preview } = usePortalStore();
    const previewId = preview.data?.id;
    const { data: previewNote } = useSWR(
        previewId ? `preview:${previewId}` : 'preview:none',
        () => (previewId ? noteCache.getItem(previewId) : Promise.resolve(undefined))
    );

    const title = previewNote?.title || 'Untitled';
    const content = previewNote?.rawContent?.slice(0, 200) || '';

    if (!preview.visible || !preview.data?.id || !preview.anchor) {
        return null;
    }

    // position relative to anchor element
    const rect = preview.anchor.getBoundingClientRect();
    const top = rect.bottom + 4;
    const left = Math.min(rect.left, window.innerWidth - 320);

    return (
        <>
            {/* backdrop to catch clicks */}
            <div
                className="fixed inset-0 z-40"
                onClick={() => preview.close()}
            />
            <div
                className="fixed z-50 w-72 max-h-48 bg-gray-700 dark:bg-neutral-700 rounded-lg shadow-xl border border-white/10 dark:border-neutral-600 overflow-hidden"
                style={{ top, left }}
                onMouseLeave={() => preview.close()}
            >
                <Link
                    href={`/${preview.data.id}`}
                    className="block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors"
                    onClick={() => preview.close()}
                >
                    <h4 className="text-sm font-semibold text-white truncate mb-1">
                        {title}
                    </h4>
                    {content && (
                        <p className="text-xs text-gray-500 line-clamp-3">
                            {content}
                        </p>
                    )}
                </Link>
            </div>
        </>
    );
};

export default PreviewModal;
