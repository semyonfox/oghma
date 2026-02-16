'use client';

import NotesProviders from '@/components/notes/providers';
import Sidebar from '@/components/notes/sidebar/sidebar';
import UIState from '@/lib/notes/state/ui';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

// inner component that uses the state containers
function NotesUI() {
    const { split, ua } = UIState.useContainer();

    if (ua?.isMobileOnly) {
        return (
            <div className="flex h-screen bg-background">
                <Sidebar />
                <div className="flex-1 overflow-auto bg-surface">
                    <div className="flex items-center justify-center h-full text-text-secondary">
                        <div className="text-center">
                            <p className="text-lg">Select a note to start editing</p>
                        </div>
                    </div>
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
                    <div className="h-full overflow-auto bg-surface flex items-center justify-center text-text-secondary">
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
                            <p className="text-lg">Select a note to start editing</p>
                            <p className="text-sm mt-2 text-text-tertiary">Click on a note in the sidebar</p>
                        </div>
                    </div>
                </Allotment.Pane>
            </Allotment>
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
