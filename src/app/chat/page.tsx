'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    SparklesIcon,
    DocumentTextIcon,
    ArrowLeftIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import ChatInterface from '@/components/chat/chat-interface';

interface Conversation {
    id: string;
    title: string;
    noteId?: string;
    noteTitle?: string;
    folderId?: string;
    folderTitle?: string;
    createdAt: number;
}

function makeConvId() {
    return `conv-${Date.now()}`;
}

function ChatPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // context can be a note (?noteId=&noteTitle=) or a folder (?folderId=&folderTitle=)
    const paramNoteId = searchParams.get('noteId') ?? undefined;
    const paramNoteTitle = searchParams.get('noteTitle') ?? undefined;
    const paramFolderId = searchParams.get('folderId') ?? undefined;
    const paramFolderTitle = searchParams.get('folderTitle') ?? undefined;

    const contextTitle = paramNoteTitle ?? paramFolderTitle;
    const contextPrefix = paramFolderId ? `Folder: "${paramFolderTitle}"` : paramNoteTitle ? `Note: "${paramNoteTitle}"` : null;

    const [conversations, setConversations] = useState<Conversation[]>(() => {
        const initial: Conversation = {
            id: makeConvId(),
            title: contextPrefix ? `Chat about ${contextPrefix}` : 'New conversation',
            noteId: paramNoteId,
            noteTitle: paramNoteTitle,
            folderId: paramFolderId,
            folderTitle: paramFolderTitle,
            createdAt: Date.now(),
        };
        return [initial];
    });

    const [activeId, setActiveId] = useState<string>(conversations[0].id);
    const activeConv = conversations.find((c) => c.id === activeId) ?? conversations[0];

    const newConversation = () => {
        const conv: Conversation = {
            id: makeConvId(),
            title: 'New conversation',
            createdAt: Date.now(),
        };
        setConversations((prev) => [conv, ...prev]);
        setActiveId(conv.id);
    };

    return (
        <div className="h-screen w-screen flex bg-gray-900 text-gray-100 overflow-hidden">

            {/* ── left sidebar ───────────────────────────────────────────── */}
            <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/8 bg-gray-950">
                {/* header */}
                <div className="flex items-center gap-2 px-4 py-4 border-b border-white/8">
                    <Link
                        href="/notes"
                        className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                        title="Back to notes"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                    </Link>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <SparklesIcon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-200 truncate">AI Chat</span>
                    </div>
                    <Link href="/" className="flex-shrink-0">
                        <img src="/oghmanotes.svg" alt="OghmaNotes" className="w-5 h-5 opacity-60 hover:opacity-100 transition-opacity" />
                    </Link>
                </div>

                {/* new conversation button */}
                <div className="px-3 py-3">
                    <button
                        onClick={newConversation}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 bg-white/4 border border-white/8 hover:bg-white/8 hover:text-gray-200 transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        New conversation
                    </button>
                </div>

                {/* conversation list */}
                <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                    {conversations.map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => setActiveId(conv.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                                conv.id === activeId
                                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-gray-200'
                                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                            }`}
                        >
                            <p className="font-medium truncate text-[13px]">{conv.title}</p>
                            {conv.noteTitle && (
                                <div className="flex items-center gap-1 mt-0.5 text-gray-600">
                                    <DocumentTextIcon className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{conv.noteTitle}</span>
                                </div>
                            )}
                            <p className="text-gray-700 mt-0.5">
                                {new Date(conv.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </p>
                        </button>
                    ))}
                </nav>

                {/* footer */}
                <div className="flex-shrink-0 border-t border-white/8 px-4 py-3">
                    <Link
                        href="/settings"
                        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >
                        Configure AI →
                    </Link>
                </div>
            </aside>

            {/* ── main chat area ─────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* top bar */}
                <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/8 bg-gray-900">
                    <div className="flex items-center gap-3 min-w-0">
                        <h1 className="text-sm font-medium text-gray-200 truncate">{activeConv.title}</h1>
                        {activeConv.noteId && (
                            <a
                                href={`/notes/${activeConv.noteId}`}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-white/4 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
                            >
                                <DocumentTextIcon className="w-3 h-3" />
                                <span className="truncate max-w-[150px]">{activeConv.noteTitle}</span>
                            </a>
                        )}
                        {activeConv.folderId && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-600/10 text-[11px] text-indigo-400">
                                {/* folder icon */}
                                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                                <span className="truncate max-w-[150px]">{activeConv.folderTitle}</span>
                                <span className="text-indigo-500/60 ml-0.5">· RAG coming soon</span>
                            </span>
                        )}
                    </div>
                </header>

                {/* chat — key forces a fresh component when conversation changes */}
                <ChatInterface
                    key={activeId}
                    noteId={activeConv.noteId}
                    noteTitle={activeConv.noteTitle}
                    className="flex-1 min-h-0"
                />
            </main>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={
            <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
                <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
            </div>
        }>
            <ChatPageInner />
        </Suspense>
    );
}
