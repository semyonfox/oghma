'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import UIState from '@/lib/notes/state/ui';
import NoteState from '@/lib/notes/state/note';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import NoteNav from '@/components/notes/note-nav';
import Editor from '@/components/editor/editor';
import NavigationSidebar from '@/components/notes/navigation-sidebar';
import AIPanel from '@/components/notes/ai-panel';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Input } from '@/components/catalyst/input';
import { Avatar } from '@/components/catalyst/avatar';

// inner component that uses the state containers
function NotesUI() {
    const { split, ua } = UIState.useContainer();
    const { note, fetchNote } = NoteState.useContainer();
    const pathname = usePathname();

    // Step 2: Extract note ID from pathname and fetch note
    // Handles both /notes and /notes/<id> routes
    const noteId = useMemo(() => {
        if (!pathname || pathname === '/notes') return null;
        const segments = pathname.split('/').filter(Boolean);
        // If we have /notes/<id>, the id is the last segment
        if (segments.length >= 2 && segments[0] === 'notes') {
            return segments[segments.length - 1] || null;
        }
        return null;
    }, [pathname]);

    // Fetch note when ID changes
    useEffect(() => {
        if (noteId && noteId !== 'notes') {
            fetchNote(noteId).catch(err => console.error('Error fetching note:', err));
        }
    }, [noteId, fetchNote]);

    // Step 4: Sync fetched note to editor store
    useEffect(() => {
        if (note) {
            useEditorStore.setState({ note });
        }
    }, [note]);

    if (ua?.isMobileOnly) {
        return (
            <div className="flex flex-col h-screen bg-background">
                {/* Mobile Navbar */}
                <nav className="border-b border-border bg-surface">
                    <div className="px-4 py-3 flex items-center justify-between">
                        <Heading level={5} className="m-0">SocsBoard</Heading>
                        <Avatar initials="U" />
                    </div>
                </nav>
                
                {/* Main content */}
                <div className="flex flex-1 overflow-hidden">
                    <Sidebar />
                    <div className="flex-1 overflow-auto bg-surface">
                        {note ? (
                            <Editor readOnly={false} />
                        ) : (
                            <div className="flex items-center justify-center h-full text-text-secondary">
                                <div className="text-center">
                                    <p className="text-lg">Select a note to start editing</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Top Navbar with breadcrumbs */}
            <nav className="border-b border-border bg-surface sticky top-0 z-40">
                <div className="flex items-center justify-between px-4 py-1.5 h-auto">
                    <div className="flex items-center gap-3 flex-1">
                        <NoteNav />
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="w-40">
                            <Input
                                type="search"
                                placeholder="Search..."
                                disabled
                                className="text-sm"
                            />
                        </div>
                        <div className="w-8 h-8 shrink-0">
                            <Avatar initials="U" />
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content Area - 4-pane layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Split pane layout */}
                <Allotment
                    vertical={false}
                    defaultSizes={[...split.sizes, 50]}
                    onChange={(sizes) => {
                        // Save only the first two sizes (tree and editor) to preserve existing behavior
                        split.saveSizes([sizes[0], sizes[1]] as [number, number]);
                    }}
                >
                    {/* Pane 1: Far-left Navigation Sidebar (icon-only) */}
                    <Allotment.Pane minSize={56} maxSize={56} snap>
                        <NavigationSidebar activeSection="notes" />
                    </Allotment.Pane>

                    {/* Pane 2: Left Tree Sidebar */}
                    <Allotment.Pane minSize={200} maxSize={600}>
                        <div className="h-full bg-surface border-r border-border overflow-y-auto">
                            <Sidebar />
                        </div>
                    </Allotment.Pane>

                    {/* Pane 3: Center Editor Area */}
                    <Allotment.Pane>
                        <div className="h-full bg-surface flex flex-col overflow-auto">
                            {note ? (
                                <Editor readOnly={false} />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-text-secondary">
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
                                        <Heading level={3} className="text-lg text-text">Select a note</Heading>
                                        <Text className="text-sm mt-2 text-text-tertiary">Click on a note in the sidebar to start editing</Text>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Allotment.Pane>

                    {/* Pane 4: Right AI Panel */}
                    <Allotment.Pane minSize={0} maxSize={400} snap>
                        <AIPanel note={note} />
                    </Allotment.Pane>
                </Allotment>
            </div>
        </div>
    );
}

// main page component wrapped with providers
export default function NotesPage() {
    return (
        <NotesProviders>
            <NotesUI />
        </NotesProviders>
    );
}
