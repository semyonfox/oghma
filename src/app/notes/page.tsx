'use client';

import { useState } from 'react';
import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import UIState from '@/lib/notes/state/ui';
import NoteNav from '@/components/notes/note-nav';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Input } from '@/components/catalyst/input';
import { Avatar } from '@/components/catalyst/avatar';

// inner component that uses the state containers
function NotesUI() {
    const { split, ua } = UIState.useContainer();
    const [currentNote, setCurrentNote] = useState<string | null>(null);

    if (ua?.isMobileOnly) {
        return (
            <div className="flex flex-col h-screen bg-background">
                {/* Mobile Navbar */}
                <nav className="border-b border-border bg-surface">
                    <div className="px-4 py-3 flex items-center justify-between">
                        <Heading level={5} className="m-0">OghmaNotes</Heading>
                        <Avatar initials="U" />
                    </div>
                </nav>
                
                {/* Main content */}
                <div className="flex flex-1 overflow-hidden">
                    <Sidebar />
                    <div className="flex-1 overflow-auto bg-surface">
                        <div className="flex items-center justify-center h-full text-text-secondary">
                            <div className="text-center">
                                <p className="text-lg">Select a note to start editing</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Top Navbar with breadcrumbs */}
            <nav className="border-b border-border bg-surface sticky top-0 z-40">
                <div className="flex items-center justify-between px-4 py-2 h-auto">
                    <div className="flex items-center gap-3 flex-1 min-h-10">
                        <NoteNav />
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="w-48">
                            <Input
                                type="search"
                                placeholder="Search notes..."
                                disabled
                                className="text-sm"
                            />
                        </div>
                        <Avatar initials="U" />
                    </div>
                </div>
            </nav>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Split pane layout */}
                <Allotment
                    vertical={false}
                    defaultSizes={split.sizes}
                    onChange={(sizes) => {
                        split.saveSizes(sizes as [number, number]);
                    }}
                >
                    {/* Left Sidebar */}
                    <Allotment.Pane minSize={200} maxSize={600}>
                        <div className="h-full bg-surface border-r border-border overflow-y-auto">
                            <Sidebar />
                        </div>
                    </Allotment.Pane>

                    {/* Main Editor Area */}
                    <Allotment.Pane>
                        <div className="h-full bg-surface flex flex-col overflow-auto">
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
                        </div>
                    </Allotment.Pane>

                    {/* Right Sidebar Placeholder */}
                    <Allotment.Pane minSize={0} maxSize={350}>
                        <div className="h-full bg-surface border-l border-border overflow-y-auto p-4">
                            <Heading level={3} className="text-sm font-semibold mb-4 text-text">AI Panel</Heading>
                            <Text className="text-sm text-text-tertiary">
                                AI insights, tasks, and metadata will appear here in future updates.
                            </Text>
                        </div>
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
