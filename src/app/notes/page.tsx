'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
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

// NEW: Import redesigned editor components
import { EditorHeader } from '@/components/editor/editor-header';
import { EditorStatusBar } from '@/components/editor/editor-status-bar';
import { CommandPalette } from '@/components/editor/command-palette';
import { PropertiesPanel } from '@/components/editor/panels/properties-panel';

// NEW: Import essential hooks
import { useAutoSave } from '@/lib/notes/hooks/use-auto-save';
import { useEditorStats } from '@/lib/notes/hooks/use-editor-stats';

// Lazy-load Editor component (includes Lexical - 992 KB)
// This defers loading until user navigates to a note
const Editor = dynamic(() => import('@/components/editor/editor'), {
  loading: () => <EditorSkeleton />,
  ssr: false, // Don't load on server, only on client
});

// Lazy-load AI Panel component
const AIPanel = dynamic(() => import('@/components/notes/ai-panel'), {
  loading: () => (
    <div className="h-full bg-slate-800 border-l border-slate-700 overflow-y-auto p-4">
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
    
    // NEW: State for command palette and right panel tabs
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'ai'>('properties');
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const [zoom, setZoom] = useState(100);
    const [tags, setTags] = useState<string[]>([]);
    
    // NEW: Auto-save hook
    const autoSaveStatus = useAutoSave(note?.id, note?.content || '');
    
    // NEW: Editor stats hook
    const stats = useEditorStats(note?.content || '');

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
            <>
                <CommandPalette
                    isOpen={commandPaletteOpen}
                    onClose={() => setCommandPaletteOpen(false)}
                />
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
                                <>
                                    {/* NEW: Editor header */}
                                    <EditorHeader
                                        note={note}
                                        tags={tags}
                                        onTitleChange={(title) => {
                                            useEditorStore.setState({
                                                note: { ...note, title },
                                            });
                                        }}
                                        onTagsChange={(newTags) => {
                                            setTags(newTags);
                                        }}
                                        onAction={(action) => {
                                            console.log('Editor action:', action);
                                        }}
                                    />
                                    <Editor readOnly={false} />
                                    {/* NEW: Editor status bar */}
                                    <EditorStatusBar
                                        content={note.content || ''}
                                        syncStatus={autoSaveStatus.status}
                                        lastSaved={autoSaveStatus.lastSaved}
                                        cursorLine={cursorLine}
                                        cursorColumn={cursorColumn}
                                        zoom={zoom}
                                        onZoomChange={setZoom}
                                    />
                                </>
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
            </>
        );
    }

    return (
        <>
            {/* NEW: Command palette at root */}
            <CommandPalette
                isOpen={commandPaletteOpen}
                onClose={() => setCommandPaletteOpen(false)}
            />
            
            <div className="flex flex-col h-screen bg-gray-900">
                {/* Top Navbar with breadcrumbs */}
                <nav className="border-b border-white/10 bg-gray-800 sticky top-0 z-40 flex-shrink-0">
                    <div className="flex items-center justify-between px-4 py-2.5 h-auto gap-4">
                        {/* Left: Note navigation */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <NoteNav />
                        </div>
                        
                        {/* Right: Search and avatar */}
                         <div className="flex items-center gap-2 flex-shrink-0">
                             <input
                                 type="search"
                                 placeholder="Search... (Cmd+K)"
                                 disabled
                                 className="hidden sm:block w-32 px-2.5 py-1 rounded text-xs bg-white/5 text-slate-300 placeholder:text-slate-500 border border-slate-600 focus:outline-none focus:border-blue-500"
                                 aria-label="Search notes"
                                 onClick={() => setCommandPaletteOpen(true)}
                             />
                             <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
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
                        defaultSizes={[56, split.sizes[0] || 250, split.sizes[1] || 1, 300]}
                        onChange={(sizes) => {
                            split.saveSizes([sizes[1], sizes[2]] as [number, number]);
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

                        {/* Pane 3: Center Editor Area - NEW: Enhanced with header and status bar */}
                         <Allotment.Pane>
                             <div className="h-full bg-slate-900 flex flex-col overflow-hidden">
                                 {note ? (
                                     <>
                                         {/* NEW: Editor header with title, tags, actions */}
                                         <EditorHeader
                                             note={note}
                                             breadcrumbs={['Notes']} // Can be enhanced with actual path
                                             tags={tags}
                                             onTitleChange={(title) => {
                                                 useEditorStore.setState({
                                                     note: { ...note, title },
                                                 });
                                             }}
                                             onTagsChange={(newTags) => {
                                                 setTags(newTags);
                                             }}
                                             onAction={(action) => {
                                                 console.log('Editor action:', action);
                                                 if (action === 'share') {
                                                     console.log('Share note:', note.id);
                                                 } else if (action === 'export') {
                                                     console.log('Export note:', note.id);
                                                 } else if (action === 'delete') {
                                                     console.log('Delete note:', note.id);
                                                 }
                                             }}
                                         />
                                         
                                         {/* Editor pane - scrollable with proper contrast */}
                                         <div className="flex-1 overflow-auto bg-slate-900">
                                             <div className="max-w-4xl mx-auto px-6 py-8">
                                                 <Editor readOnly={false} />
                                             </div>
                                         </div>
                                         
                                         {/* NEW: Status bar with sync, stats, zoom */}
                                         <EditorStatusBar
                                             content={note.content || ''}
                                             syncStatus={autoSaveStatus.status}
                                             lastSaved={autoSaveStatus.lastSaved}
                                             cursorLine={cursorLine}
                                             cursorColumn={cursorColumn}
                                             zoom={zoom}
                                             onZoomChange={setZoom}
                                         />
                                     </>
                                 ) : (
                                     <div className="flex-1 flex items-center justify-center text-slate-400">
                                         <div className="text-center">
                                             <DocumentIcon className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                                             <h3 className="text-sm font-semibold text-slate-300 mb-1">Select a note</h3>
                                             <p className="text-xs text-slate-500">Click on a note in the sidebar to start editing</p>
                                         </div>
                                     </div>
                                 )}
                             </div>
                         </Allotment.Pane>

                        {/* Pane 4: Right Panel - NEW: Tabbed properties and AI chat */}
                        <Allotment.Pane minSize={0} maxSize={400} snap>
                            <div className="h-full flex flex-col bg-gray-800">
                                {/* Tab buttons */}
                                <div className="flex border-b border-gray-700 flex-shrink-0">
                                    <button
                                        onClick={() => setRightPanelTab('properties')}
                                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                            rightPanelTab === 'properties'
                                                ? 'border-b-2 border-indigo-500 text-white'
                                                : 'text-gray-400 hover:text-gray-300'
                                        }`}
                                    >
                                        Properties
                                    </button>
                                    <button
                                        onClick={() => setRightPanelTab('ai')}
                                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                            rightPanelTab === 'ai'
                                                ? 'border-b-2 border-indigo-500 text-white'
                                                : 'text-gray-400 hover:text-gray-300'
                                        }`}
                                    >
                                        AI Chat
                                    </button>
                                </div>

                                {/* Tab content */}
                                <div className="flex-1 overflow-hidden">
                                    {rightPanelTab === 'properties' ? (
                                        <PropertiesPanel
                                            note={note}
                                            tags={tags}
                                            onTagsChange={(newTags) => {
                                                setTags(newTags);
                                            }}
                                        />
                                    ) : (
                                        <AIPanel note={note} />
                                    )}
                                </div>
                            </div>
                        </Allotment.Pane>
                    </Allotment>
                </div>
            </div>
        </>
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
