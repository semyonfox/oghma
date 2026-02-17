'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import UIState from '@/lib/notes/state/ui';
import NoteState from '@/lib/notes/state/note';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import NoteNav from '@/components/notes/note-nav';
import EditorSkeleton from '@/components/editor/editor-skeleton';
import NavigationSidebar from '@/components/notes/navigation-sidebar';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { DocumentIcon } from '@heroicons/react/24/outline';

// Lazy-load Editor component (includes Lexical - 992 KB)
// This defers loading until user navigates to a note
const Editor = dynamic(() => import('@/components/editor/editor'), {
  loading: () => <EditorSkeleton />,
  ssr: false, // Don't load on server, only on client
});

// Lazy-load AI Panel component
const AIPanel = dynamic(() => import('@/components/notes/ai-panel'), {
  loading: () => (
    <div className="ai-panel">
      <div className="h-12 bg-white/10 rounded animate-pulse" />
    </div>
  ),
  ssr: false,
});

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
            <div className="flex flex-col h-screen bg-gray-900">
                {/* Mobile Navbar */}
                <nav className="border-b border-white/10 bg-gray-800">
                    <div className="px-4 py-3 flex items-center justify-between">
                        <h1 className="text-lg font-semibold text-white">AI Study Vault</h1>
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">U</div>
                    </div>
                </nav>
                
                {/* Main content */}
                <div className="flex flex-1 overflow-hidden">
                    <Sidebar />
                    <div className="flex-1 overflow-auto bg-gray-800 flex flex-col">
                        {note ? (
                            <Editor readOnly={false} />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400">
                                    <DocumentIcon className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                                    <p className="text-sm font-semibold text-white mb-1">Select a note</p>
                                    <p className="text-xs">Click on a note in the sidebar to start editing</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900">
            {/* Top Navbar with breadcrumbs */}
            <nav className="border-b border-white/10 bg-gray-800 sticky top-0 z-40 flex-shrink-0">
                <div className="flex items-center justify-between px-4 py-2.5 h-auto gap-4">
                    {/* Left: Note navigation */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <NoteNav />
                    </div>
                    
                    {/* Right: Search and avatar */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="w-40 hidden sm:block">
                            <input
                                type="search"
                                placeholder="Search notes..."
                                disabled
                                className="w-full px-3 py-1.5 rounded-md bg-white/5 text-white text-sm placeholder:text-gray-500 border border-white/10 focus:outline-none focus:border-indigo-500"
                                aria-label="Search notes"
                            />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            U
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
                        <div className="h-full bg-gray-800 border-r border-white/10 overflow-y-auto flex flex-col">
                            <Sidebar />
                        </div>
                    </Allotment.Pane>

                    {/* Pane 3: Center Editor Area */}
                    <Allotment.Pane>
                        <div className="h-full bg-gray-800 flex flex-col overflow-auto">
                            {note ? (
                                <Editor readOnly={false} />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400">
                                    <div className="text-center">
                                        <DocumentIcon className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                                        <h3 className="text-sm font-semibold text-white mb-1">Select a note</h3>
                                        <p className="text-xs">Click on a note in the sidebar to start editing</p>
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
