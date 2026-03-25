'use client';

import { Fragment, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MagnifyingGlassIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { DocumentTextIcon } from '@heroicons/react/24/solid';
import useSearchStore from '@/lib/notes/state/search';
import usePortalStore from '@/lib/notes/state/portal';
import { useRouter } from 'next/navigation';
import { debounce } from '@/lib/notes/utils/debounce';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface SearchResultItem {
    id: string;
    title: string;
    snippet?: string;
    source: 'local' | 'keyword' | 'semantic';
}

export default function SearchModal() {
    const { t } = useI18n();
    const { search } = usePortalStore();
    const { keyword, setKeyword, filterNotes } = useSearchStore();
    const router = useRouter();

    const [localResults, setLocalResults] = useState<SearchResultItem[]>([]);
    const [keywordResults, setKeywordResults] = useState<SearchResultItem[]>([]);
    const [semanticResults, setSemanticResults] = useState<SearchResultItem[]>([]);
    const [isLocalSearching, setIsLocalSearching] = useState(false);
    const [isRemoteSearching, setIsRemoteSearching] = useState(false);
    const [isSemanticSearching, setIsSemanticSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    // track known ids so semantic can exclude them server-side
    const knownIdsRef = useRef<Set<string>>(new Set());

    // merge local + keyword, deduped
    const mergedKeyword = useMemo(() => {
        const seen = new Set<string>();
        const merged: SearchResultItem[] = [];
        for (const r of localResults) {
            if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        for (const r of keywordResults) {
            if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        // update ref for semantic exclusion
        knownIdsRef.current = seen;
        return merged;
    }, [localResults, keywordResults]);

    const allResults = useMemo(
        () => [...mergedKeyword, ...semanticResults],
        [mergedKeyword, semanticResults]
    );

    const isSearching = isLocalSearching && allResults.length === 0;

    // tier 1: local IndexedDB (instant, 150ms debounce)
    const debouncedLocalSearch = useMemo(
        () => debounce(async (q: string) => {
            if (!q.trim()) {
                setLocalResults([]);
                setIsLocalSearching(false);
                return;
            }
            setIsLocalSearching(true);
            try {
                const results = await filterNotes(q);
                setLocalResults((results || []).map((r: any) => ({
                    id: r.id || r.note_id,
                    title: r.title || 'Untitled',
                    snippet: r.rawContent?.slice(0, 150) || '',
                    source: 'local' as const,
                })));
            } finally {
                setIsLocalSearching(false);
            }
        }, 150),
        [filterNotes]
    );

    // tier 2: remote PG keyword (fast, 400ms debounce)
    const debouncedKeywordSearch = useMemo(
        () => debounce(async (q: string) => {
            if (!q.trim() || q.length < 2) {
                setKeywordResults([]);
                setIsRemoteSearching(false);
                return;
            }

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setIsRemoteSearching(true);
            try {
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(q)}&mode=keyword`,
                    { signal: controller.signal }
                );
                if (!res.ok) return;
                const data = await res.json();
                setKeywordResults((data.results || []).map((r: any) => ({
                    id: r.note_id,
                    title: r.title,
                    snippet: r.snippet,
                    source: 'keyword' as const,
                })));
            } catch (err: any) {
                if (err.name !== 'AbortError') console.error('keyword search failed', err);
            } finally {
                setIsRemoteSearching(false);
            }
        }, 400),
        []
    );

    // tier 3: semantic (slow, 800ms debounce, excludes known ids)
    const debouncedSemanticSearch = useMemo(
        () => debounce(async (q: string) => {
            if (!q.trim() || q.length < 3) {
                setSemanticResults([]);
                setIsSemanticSearching(false);
                return;
            }

            setIsSemanticSearching(true);
            try {
                const exclude = [...knownIdsRef.current].join(',');
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(q)}&mode=semantic&exclude=${encodeURIComponent(exclude)}`
                );
                if (!res.ok) return;
                const data = await res.json();
                setSemanticResults((data.results || []).map((r: any) => ({
                    id: r.note_id,
                    title: r.title,
                    snippet: r.snippet,
                    source: 'semantic' as const,
                })));
            } catch {
                // semantic is best-effort
            } finally {
                setIsSemanticSearching(false);
            }
        }, 800),
        []
    );

    // trigger all three tiers on keyword change
    useEffect(() => {
        if (search.visible && keyword) {
            debouncedLocalSearch(keyword);
            debouncedKeywordSearch(keyword);
            debouncedSemanticSearch(keyword);
        } else {
            setLocalResults([]);
            setKeywordResults([]);
            setSemanticResults([]);
        }
    }, [keyword, search.visible, debouncedLocalSearch, debouncedKeywordSearch, debouncedSemanticSearch]);

    // reset selection when results change
    useEffect(() => { setSelectedIndex(0); }, [allResults.length]);

    const handleClose = useCallback(() => {
        search.close();
        setKeyword('');
        abortRef.current?.abort();
    }, [search, setKeyword]);

    const handleSelectNote = useCallback(
        (noteId: string) => {
            router.push(`/notes/${noteId}`);
            handleClose();
        },
        [router, handleClose]
    );

    const handleAskAI = useCallback(() => {
        router.push(`/chat?q=${encodeURIComponent(keyword)}`);
        handleClose();
    }, [router, keyword, handleClose]);

    // keyboard navigation
    useEffect(() => {
        if (!search.visible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl+K to toggle
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (search.visible) handleClose();
                else search.open();
                return;
            }
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(prev => Math.max(0, prev - 1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(prev => Math.min(allResults.length - 1, prev + 1));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (allResults[selectedIndex]) {
                        handleSelectNote(allResults[selectedIndex].id);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [search, handleClose, allResults, selectedIndex, handleSelectNote]);

    // open shortcut when modal is closed
    useEffect(() => {
        if (search.visible) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                search.open();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [search]);

    const renderResult = (result: SearchResultItem, idx: number) => (
        <li key={`${result.source}-${result.id}`}>
            <button
                onClick={() => handleSelectNote(result.id)}
                className={`w-full px-4 py-3 text-left transition-colors focus:outline-none ${
                    idx === selectedIndex
                        ? 'bg-primary-500/10 border-l-2 border-primary-400'
                        : 'hover:bg-white/5 border-l-2 border-transparent'
                }`}
            >
                <div className="flex items-start">
                    <DocumentTextIcon className="mt-0.5 h-4 w-4 text-text-tertiary flex-shrink-0" />
                    <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                            {result.title || 'Untitled'}
                        </p>
                        {result.snippet && (
                            <p className="mt-0.5 text-xs text-text-tertiary line-clamp-1">
                                {result.snippet}
                            </p>
                        )}
                    </div>
                    {result.source === 'semantic' && (
                        <span className="ml-2 text-[10px] text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                            similar
                        </span>
                    )}
                </div>
            </button>
        </li>
    );

    return (
        <Transition appear show={search.visible} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={handleClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-start justify-center p-4 pt-[20vh]">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-xl bg-surface border border-border shadow-2xl transition-all">
                                {/* search input */}
                                <div className="flex items-center border-b border-border-subtle px-4 py-3">
                                    <MagnifyingGlassIcon className={`h-5 w-5 transition-opacity ${
                                        isSearching ? 'text-primary-400 animate-pulse' : 'text-text-tertiary'
                                    }`} />
                                    <input
                                        type="text"
                                        className="ml-3 flex-1 border-none outline-none bg-transparent text-text placeholder:text-text-tertiary"
                                        placeholder={t('Search notes...')}
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        autoFocus
                                    />
                                    {(isRemoteSearching || isSemanticSearching) && keyword && (
                                        <div className="mr-2 h-4 w-4 border-2 border-border border-t-primary-400 rounded-full animate-spin" />
                                    )}
                                    <button
                                        onClick={handleClose}
                                        className="ml-2 text-text-tertiary hover:text-text transition-colors"
                                    >
                                        <XMarkIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                {/* results */}
                                <div className="max-h-96 overflow-y-auto">
                                    {/* empty state */}
                                    {!keyword && (
                                        <div className="px-4 py-8 text-center text-text-tertiary">
                                            <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-text-tertiary opacity-40" />
                                            <p className="mt-2">{t('Type to search notes')}</p>
                                            <p className="mt-1 text-sm">
                                                {t('Press')}{' '}
                                                <kbd className="px-2 py-1 bg-surface-elevated border border-border rounded text-xs">
                                                    {typeof navigator !== 'undefined' &&
                                                    navigator.platform.includes('Mac')
                                                        ? '⌘'
                                                        : 'Ctrl'}
                                                    +K
                                                </kbd>{' '}
                                                {t('to open search')}
                                            </p>
                                        </div>
                                    )}

                                    {/* loading — only show if local hasn't returned yet */}
                                    {keyword && isSearching && (
                                        <div className="px-4 py-8 text-center text-text-tertiary">
                                            <div className="mx-auto h-6 w-6 border-2 border-border border-t-primary-400 rounded-full animate-spin" />
                                            <p className="mt-3">{t('Searching notes...')}</p>
                                        </div>
                                    )}

                                    {/* keyword results (local + remote merged) */}
                                    {mergedKeyword.length > 0 && (
                                        <ul className="divide-y divide-border-subtle">
                                            {mergedKeyword.map((result, idx) => renderResult(result, idx))}
                                        </ul>
                                    )}

                                    {/* semantic results section */}
                                    {semanticResults.length > 0 && (
                                        <>
                                            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-text-tertiary bg-surface-elevated/50 border-y border-border-subtle">
                                                {t('Related by meaning')}
                                            </div>
                                            <ul className="divide-y divide-border-subtle">
                                                {semanticResults.map((result, idx) =>
                                                    renderResult(result, mergedKeyword.length + idx)
                                                )}
                                            </ul>
                                        </>
                                    )}

                                    {/* no results */}
                                    {keyword && !isSearching && !isRemoteSearching && !isSemanticSearching && allResults.length === 0 && (
                                        <div className="px-4 py-8 text-center text-text-tertiary">
                                            <p>{t('No results found for')} &quot;{keyword}&quot;</p>
                                        </div>
                                    )}
                                </div>

                                {/* footer: Ask AI + nav hints */}
                                <div className="border-t border-border-subtle px-4 py-2 flex items-center justify-between">
                                    {keyword.trim().length >= 2 ? (
                                        <button
                                            onClick={handleAskAI}
                                            className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                                        >
                                            <SparklesIcon className="h-3.5 w-3.5" />
                                            {t('Ask AI')}
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                    <div className="text-xs text-text-tertiary flex items-center gap-3">
                                        <span>
                                            <kbd className="px-1 bg-surface-elevated border border-border rounded">↑</kbd>{' '}
                                            <kbd className="px-1 bg-surface-elevated border border-border rounded">↓</kbd>{' '}
                                            {t('navigate')}
                                        </span>
                                        <span>
                                            <kbd className="px-1 bg-surface-elevated border border-border rounded">Enter</kbd>{' '}
                                            {t('open')}
                                        </span>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
