"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import useSearchStore from "@/lib/notes/state/search";
import usePortalStore from "@/lib/notes/state/portal";
import { useRouter } from "next/navigation";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { debounce } from "@/lib/notes/utils/debounce";
import useI18n from "@/lib/notes/hooks/use-i18n";

export default function SearchModal() {
  const { t } = useI18n();
  const { search } = usePortalStore();
  const { keyword, setKeyword, filterNotes } = useSearchStore();
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSemanticLoading, setIsSemanticLoading] = useState(false);
  const semanticAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);

  // Memoize search results and only update when the search query actually changes
  const debouncedSearch = useMemo(
    () =>
      debounce(async (searchKeyword: string) => {
        const seq = ++searchSeqRef.current;
        semanticAbortRef.current?.abort();

        if (!searchKeyword.trim()) {
          setSearchResults([]);
          setIsSearching(false);
          setIsSemanticLoading(false);
          return;
        }

        setIsSearching(true);
        try {
          // Stage 1: instant local keyword search.
          const keywordResults = await filterNotes(searchKeyword);
          if (searchSeqRef.current !== seq) return;

          const baseResults = keywordResults || [];
          setSearchResults(baseResults);
          setIsSearching(false);

          // Stage 2: async semantic enrichment.
          setIsSemanticLoading(true);
          const controller = new AbortController();
          semanticAbortRef.current = controller;
          const exclude = baseResults
            .map((r: any) => r?.id)
            .filter(Boolean)
            .join(",");
          const url = `/api/search?q=${encodeURIComponent(searchKeyword)}&mode=semantic${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ""}`;
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return;

          const data = await res.json();
          if (searchSeqRef.current !== seq) return;

          const semanticResults = (data?.results ?? []).map((r: any) => ({
            id: r.note_id,
            title: r.title,
            snippet: r.snippet,
          }));

          if (semanticResults.length > 0) {
            const seen = new Set(baseResults.map((r: any) => r?.id));
            const merged = [
              ...baseResults,
              ...semanticResults.filter((r: any) => {
                if (!r?.id || seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
              }),
            ];
            setSearchResults(merged);
          }
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        } finally {
          if (searchSeqRef.current === seq) {
            setIsSearching(false);
            setIsSemanticLoading(false);
          }
        }
      }, 500),
    [filterNotes],
  );

  useEffect(() => {
    if (search.visible) {
      debouncedSearch(keyword);
    } else {
      semanticAbortRef.current?.abort();
      setSearchResults([]);
      setIsSemanticLoading(false);
    }
  }, [keyword, search.visible, debouncedSearch]);

  useEffect(() => {
    return () => semanticAbortRef.current?.abort();
  }, []);

  const handleClose = useCallback(() => {
    semanticAbortRef.current?.abort();
    search.close();
    setKeyword("");
  }, [search, setKeyword]);

  const handleSelectNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
      handleClose();
    },
    [router, handleClose],
  );

  // keyboard shortcut: Cmd/Ctrl + K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        search.open();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [search]);

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
                <div className="flex items-center border-b border-border-subtle px-4 py-3">
                  <MagnifyingGlassIcon
                    className={`h-5 w-5 transition-opacity ${isSearching ? "text-primary-400 animate-pulse" : "text-text-tertiary"}`}
                  />
                  <input
                    type="text"
                    className="ml-3 flex-1 border-none outline-none bg-transparent text-text placeholder:text-text-tertiary"
                    placeholder={t("Search notes...")}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={handleClose}
                    className="ml-3 text-text-tertiary hover:text-text transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {!keyword && (
                    <div className="px-4 py-8 text-center text-text-tertiary">
                      <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-text-tertiary opacity-40" />
                      <p className="mt-2">{t("Type to search notes")}</p>
                      <p className="mt-1 text-sm">
                        {t("Press")}{" "}
                        <kbd className="px-2 py-1 bg-surface-elevated border border-border rounded text-xs">
                          {typeof navigator !== "undefined" &&
                          navigator.platform.includes("Mac")
                            ? "⌘"
                            : "Ctrl"}
                          +K
                        </kbd>{" "}
                        {t("to open search")}
                      </p>
                    </div>
                  )}

                  {keyword && isSearching && (
                    <div className="px-4 py-8 text-center text-text-tertiary">
                      <div className="mx-auto h-6 w-6 border-2 border-border border-t-primary-400 rounded-full animate-spin" />
                      <p className="mt-3">{t("Searching notes...")}</p>
                    </div>
                  )}

                  {keyword &&
                    !isSearching &&
                    searchResults.length > 0 &&
                    isSemanticLoading && (
                      <div className="px-4 py-2 text-xs text-text-tertiary border-b border-border-subtle">
                        {t("Refining with semantic search...")}
                      </div>
                    )}

                  {keyword && !isSearching && searchResults.length === 0 && (
                    <div className="px-4 py-8 text-center text-text-tertiary">
                      <p>
                        {t("No results found for")} &quot;{keyword}&quot;
                      </p>
                    </div>
                  )}

                  {keyword && searchResults.length > 0 && (
                    <ul className="divide-y divide-border-subtle">
                      {searchResults.map((result: any) => (
                        <li key={result.id}>
                          <button
                            onClick={() => handleSelectNote(result.id)}
                            className="w-full px-4 py-3 text-left hover:bg-subtle focus:bg-subtle focus:outline-none transition-colors"
                          >
                            <div className="flex items-start">
                              <DocumentTextIcon className="mt-1 h-5 w-5 text-text-tertiary flex-shrink-0" />
                              <div className="ml-3 flex-1 min-w-0">
                                <p className="text-sm font-medium text-text truncate">
                                  {result.title || "Untitled"}
                                </p>
                                {result.snippet && (
                                  <p className="mt-1 text-sm text-text-tertiary line-clamp-2">
                                    {result.snippet}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t border-border-subtle px-4 py-2 text-xs text-text-tertiary">
                  <div className="flex items-center justify-between">
                    <span>
                      {t("Navigate with")}{" "}
                      <kbd className="px-1 bg-surface-elevated border border-border rounded">
                        ↑
                      </kbd>{" "}
                      <kbd className="px-1 bg-surface-elevated border border-border rounded">
                        ↓
                      </kbd>
                    </span>
                    <span>
                      {t("Select with")}{" "}
                      <kbd className="px-1 bg-surface-elevated border border-border rounded">
                        Enter
                      </kbd>
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
