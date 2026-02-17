'use client';

// preview modal - shows note preview on hover/click
// ported from Notea (MIT License) - MUI Popover replaced with Tailwind floating panel
import { FC, useEffect, useState, useCallback } from 'react';
import PortalState from '@/lib/notes/state/portal';
import noteCache from '@/lib/notes/cache/note';
import Link from 'next/link';

const PreviewModal: FC = () => {
    const { preview } = PortalState.useContainer();
    const [title, setTitle] = useState<string>('');
    const [content, setContent] = useState<string>('');

    const loadPreview = useCallback(async () => {
        const id = preview.data?.id;
        if (!id) return;

        const note = await noteCache.getItem(id);
        if (note) {
            setTitle(note.title || 'Untitled');
            setContent(note.rawContent?.slice(0, 200) || '');
        }
    }, [preview.data?.id]);

    useEffect(() => {
        if (preview.visible && preview.data?.id) {
            loadPreview();
        }
    }, [preview.visible, preview.data?.id, loadPreview]);

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
