'use client';

import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import NoteNav from '@/components/notes/note-nav';
import ModeAwareEditor from '@/components/editor/mode-aware-editor';
import UIState from '@/lib/notes/state/ui';
import NoteState from '@/lib/notes/state/note';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';

// inner component that uses the state containers
function NotesUI() {
    const { split, ua } = UIState.useContainer();
    const { note, fetchNote } = NoteState.useContainer();
    const params = useParams();
    const noteId = params?.id as string;

    useEffect(() => {
        if (noteId) {
            fetchNote(noteId).catch((err) => {
                console.error('Failed to fetch note:', err);
            });
        }
    }, [noteId, fetchNote]);

    if (ua?.isMobileOnly) {
        return (
            <div className="flex h-screen bg-background">
                <Sidebar />
                <div className="flex-1 overflow-auto bg-surface">
                    <NoteNav />
                    <ModeAwareEditor />
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-background">
            <Allotment
                defaultSizes={split.sizes}
                onChange={(sizes) => {
                    split.saveSizes(sizes as [number, number]);
                }}
            >
                <Allotment.Pane minSize={200} maxSize={600}>
                    <div className="h-full bg-surface border-r border-border">
                        <Sidebar />
                    </div>
                </Allotment.Pane>
                <Allotment.Pane>
                    <div className="h-full overflow-auto bg-surface">
                        <NoteNav />
                        {note ? (
                            <ModeAwareEditor />
                        ) : (
                            <div className="flex items-center justify-center h-full text-text-secondary">
                                <div className="text-center">
                                    <svg
                                        className="w-16 h-16 mx-auto mb-4 text-neutral-300 dark:text-neutral-600"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                    </svg>
                                    <p className="text-lg">Loading note...</p>
                                </div>
                            </div>
                        )}
                    </div>
                </Allotment.Pane>
            </Allotment>
        </div>
    );
}

// main page component wrapped with providers
export default function NotePage() {
    return (
        <NotesProviders>
            <NotesUI />
        </NotesProviders>
    );
}
