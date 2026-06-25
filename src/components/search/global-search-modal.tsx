"use client";

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, Transition } from "@headlessui/react";
import { usePathname, useRouter } from "next/navigation";
import {
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import useGlobalSearchStore from "@/lib/global-search/state";
import useI18n from "@/lib/notes/hooks/use-i18n";

type ResultType = "destination" | "note" | "chat" | "quiz";
type ResultSource = "keyword" | "semantic" | "recent" | "destination";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  source: ResultSource;
  keywords?: string[];
}

interface ResultsBySection {
  destinations: SearchResult[];
  notes: SearchResult[];
  chats: SearchResult[];
  quizzes: SearchResult[];
}

const APP_PATH_PREFIXES = ["/notes", "/chat", "/calendar", "/quiz", "/settings"];

const DESTINATIONS: SearchResult[] = [
  {
    id: "notes",
    type: "destination",
    title: "Notes",
    subtitle: "Open the notes workspace",
    href: "/notes",
    source: "destination",
    keywords: ["markdown", "documents", "files", "library"],
  },
  {
    id: "chat",
    type: "destination",
    title: "AI Chat",
    subtitle: "Open a new study chat",
    href: "/chat",
    source: "destination",
    keywords: ["assistant", "ask", "rag", "conversation"],
  },
  {
    id: "quiz",
    type: "destination",
    title: "Quiz",
    subtitle: "Review due cards",
    href: "/quiz",
    source: "destination",
    keywords: ["flashcards", "review", "study", "cards"],
  },
  {
    id: "calendar",
    type: "destination",
    title: "Calendar",
    subtitle: "Review assignments and schedule",
    href: "/calendar",
    source: "destination",
    keywords: ["assignments", "planner", "due", "schedule"],
  },
  {
    id: "settings",
    type: "destination",
    title: "Settings",
    subtitle: "Account, Canvas, AI, and data settings",
    href: "/settings",
    source: "destination",
    keywords: ["account", "preferences", "canvas", "export"],
  },
  {
    id: "settings-ai",
    type: "destination",
    title: "AI Settings",
    subtitle: "Model and Canvas access controls",
    href: "/settings#ai",
    source: "destination",
    keywords: ["model", "provider", "chat", "canvas access"],
  },
  {
    id: "settings-canvas",
    type: "destination",
    title: "Canvas",
    subtitle: "Connect and import Canvas courses",
    href: "/settings#canvas",
    source: "destination",
    keywords: ["lms", "import", "course", "token"],
  },
  {
    id: "settings-editor",
    type: "destination",
    title: "Editor & Theme",
    subtitle: "Theme and editor preferences",
    href: "/settings#editor",
    source: "destination",
    keywords: ["appearance", "dark", "light", "width"],
  },
  {
    id: "settings-account",
    type: "destination",
    title: "Account",
    subtitle: "Profile and account details",
    href: "/settings#account",
    source: "destination",
    keywords: ["profile", "email", "name"],
  },
];

const SECTION_LABELS: Record<keyof ResultsBySection, string> = {
  destinations: "Destinations",
  notes: "Notes",
  chats: "AI Chats",
  quizzes: "Quizzes",
};

const SECTION_ORDER: (keyof ResultsBySection)[] = [
  "destinations",
  "notes",
  "chats",
  "quizzes",
];

function resultIcon(type: ResultType) {
  if (type === "note") return DocumentTextIcon;
  if (type === "chat") return ChatBubbleLeftRightIcon;
  if (type === "quiz") return AcademicCapIcon;
  if (type === "destination") return Cog6ToothIcon;
  return MagnifyingGlassIcon;
}

function detailIcon(type: ResultType) {
  if (type === "note") return DocumentTextIcon;
  if (type === "chat") return SparklesIcon;
  if (type === "quiz") return AcademicCapIcon;
  if (type === "destination") return Cog6ToothIcon;
  return MagnifyingGlassIcon;
}

function matchesDestination(result: SearchResult, query: string) {
  if (!query) {
    return ["notes", "chat", "quiz", "settings"].includes(result.id);
  }

  const haystack = [
    result.title,
    result.subtitle,
    ...(result.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sourceLabel(source: ResultSource) {
  if (source === "semantic") return "Semantic";
  if (source === "recent") return "Recent";
  if (source === "destination") return "Open";
  return "Keyword";
}

function flattenResults(results: ResultsBySection) {
  return SECTION_ORDER.flatMap((section) => results[section]);
}

function normalizeApiResults(value: any): Omit<ResultsBySection, "destinations"> {
  return {
    notes: Array.isArray(value?.notes) ? value.notes : [],
    chats: Array.isArray(value?.chats) ? value.chats : [],
    quizzes: Array.isArray(value?.quizzes) ? value.quizzes : [],
  };
}

export default function GlobalSearchModal() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { visible, open, close } = useGlobalSearchStore();
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<
    Omit<ResultsBySection, "destinations">
  >({ notes: [], chats: [], quizzes: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const enabled = APP_PATH_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );
  const trimmedQuery = query.trim();

  const results: ResultsBySection = useMemo(
    () => ({
      destinations: DESTINATIONS.filter((result) =>
        matchesDestination(result, trimmedQuery),
      ).slice(0, trimmedQuery ? 5 : 4),
      ...remoteResults,
    }),
    [remoteResults, trimmedQuery],
  );

  const flatResults = useMemo(() => flattenResults(results), [results]);
  const selectedResult = flatResults[selectedIndex] ?? flatResults[0] ?? null;
  const hasAnyResult = flatResults.length > 0;

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    close();
    setQuery("");
    setRemoteResults({ notes: [], chats: [], quizzes: [] });
    setSelectedIndex(0);
    setLoading(false);
  }, [close]);

  const openResult = useCallback(
    (result: SearchResult | null) => {
      if (!result) return;
      router.push(result.href);
      handleClose();
    },
    [handleClose, router],
  );

  useEffect(() => {
    if (!enabled && visible) handleClose();
  }, [enabled, handleClose, visible]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, open]);

  useEffect(() => {
    if (!visible) return;

    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (requestSeqRef.current === seq) {
            setRemoteResults({ notes: [], chats: [], quizzes: [] });
          }
          return;
        }

        const data = await response.json();
        if (requestSeqRef.current !== seq) return;
        setRemoteResults(normalizeApiResults(data?.results));
      } catch (error: any) {
        if (error?.name === "AbortError") return;
        if (requestSeqRef.current === seq) {
          setRemoteResults({ notes: [], chats: [], quizzes: [] });
        }
      } finally {
        if (requestSeqRef.current === seq) {
          setLoading(false);
        }
      }
    }, trimmedQuery ? 180 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery, visible]);

  useEffect(() => {
    if (selectedIndex > Math.max(flatResults.length - 1, 0)) {
      setSelectedIndex(0);
    }
  }, [flatResults.length, selectedIndex]);

  if (!enabled) return null;

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) =>
        flatResults.length === 0 ? 0 : (index + 1) % flatResults.length,
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) =>
        flatResults.length === 0
          ? 0
          : (index - 1 + flatResults.length) % flatResults.length,
      );
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openResult(selectedResult);
    }
  };

  return (
    <Transition appear show={visible} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-3 pt-[12vh] sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-150"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-100"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl overflow-hidden rounded-radius-lg border border-border bg-surface shadow-2xl">
                <Dialog.Title className="sr-only">
                  {t("Search OghmaNotes")}
                </Dialog.Title>
                <div className="flex items-center border-b border-border-subtle px-4 py-3">
                  <MagnifyingGlassIcon
                    className={`h-5 w-5 shrink-0 ${loading ? "animate-pulse text-primary-400" : "text-text-tertiary"}`}
                  />
                  <input
                    type="text"
                    className="ml-3 min-w-0 flex-1 border-none bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
                    placeholder={t("Search OghmaNotes")}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelectedIndex(0);
                    }}
                    onKeyDown={onInputKeyDown}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleClose}
                    className="ml-3 rounded-radius-md p-1 text-text-tertiary transition-colors hover:bg-subtle hover:text-text"
                    title={t("Close")}
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid min-h-[430px] grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                  <div className="max-h-[62vh] overflow-y-auto border-border-subtle md:border-r">
                    {SECTION_ORDER.map((section) => {
                      const sectionResults = results[section];
                      if (sectionResults.length === 0) return null;

                      let runningIndex = 0;
                      for (const previous of SECTION_ORDER) {
                        if (previous === section) break;
                        runningIndex += results[previous].length;
                      }

                      return (
                        <div key={section} className="py-2">
                          <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                            {t(SECTION_LABELS[section])}
                          </div>
                          <ul>
                            {sectionResults.map((result, index) => {
                              const globalIndex = runningIndex + index;
                              const selected = globalIndex === selectedIndex;
                              const Icon = resultIcon(result.type);

                              return (
                                <li key={`${result.type}-${result.id}`}>
                                  <button
                                    type="button"
                                    onMouseEnter={() =>
                                      setSelectedIndex(globalIndex)
                                    }
                                    onClick={() => openResult(result)}
                                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                                      selected
                                        ? "bg-primary-500/10"
                                        : "hover:bg-subtle"
                                    }`}
                                  >
                                    <span
                                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-md border ${
                                        selected
                                          ? "border-primary-400/30 bg-primary-400/10 text-primary-300"
                                          : "border-border-subtle bg-surface-elevated text-text-tertiary"
                                      }`}
                                    >
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-sm font-medium text-text">
                                          {result.title}
                                        </span>
                                        <span className="shrink-0 rounded-full border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
                                          {sourceLabel(result.source)}
                                        </span>
                                      </span>
                                      {result.subtitle && (
                                        <span className="mt-0.5 block truncate text-xs text-text-tertiary">
                                          {result.subtitle}
                                        </span>
                                      )}
                                      {result.snippet && (
                                        <span className="mt-1 line-clamp-2 text-xs text-text-tertiary">
                                          {result.snippet}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}

                    {!hasAnyResult && loading && (
                      <div className="flex min-h-[320px] items-center justify-center">
                        <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary-400 animate-spin" />
                      </div>
                    )}

                    {!hasAnyResult && !loading && (
                      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                        <MagnifyingGlassIcon className="h-10 w-10 text-text-tertiary opacity-50" />
                        <p className="mt-3 text-sm font-medium text-text">
                          {trimmedQuery
                            ? t('No matches for "{query}"', {
                                query: trimmedQuery,
                              })
                            : t("No recent results")}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openResult(
                                DESTINATIONS.find(
                                  (item) => item.id === "chat",
                                ) ?? null,
                              )
                            }
                            className="rounded-radius-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-subtle"
                          >
                            {t("Open AI Chat")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openResult(
                                DESTINATIONS.find(
                                  (item) => item.id === "notes",
                                ) ?? null,
                              )
                            }
                            className="rounded-radius-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-subtle"
                          >
                            {t("Open Notes")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <aside className="hidden max-h-[62vh] overflow-y-auto bg-surface-elevated/40 p-5 md:block">
                    {selectedResult ? (
                      <div className="flex h-full flex-col">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md border border-border-subtle bg-surface text-text-tertiary">
                            {(() => {
                              const Icon = detailIcon(selectedResult.type);
                              return <Icon className="h-5 w-5" />;
                            })()}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-text-tertiary">
                              {sourceLabel(selectedResult.source)}
                            </div>
                            <h2 className="mt-1 line-clamp-2 text-base font-semibold text-text">
                              {selectedResult.title}
                            </h2>
                            {selectedResult.subtitle && (
                              <p className="mt-1 text-sm text-text-tertiary">
                                {selectedResult.subtitle}
                              </p>
                            )}
                          </div>
                        </div>

                        {selectedResult.snippet ? (
                          <div className="mt-5 rounded-radius-md border border-border-subtle bg-surface p-4 text-sm leading-6 text-text-secondary">
                            {selectedResult.snippet}
                          </div>
                        ) : (
                          <div className="mt-5 rounded-radius-md border border-border-subtle bg-surface p-4 text-sm text-text-tertiary">
                            {selectedResult.href}
                          </div>
                        )}

                        <div className="mt-auto pt-6">
                          <button
                            type="button"
                            onClick={() => openResult(selectedResult)}
                            className="inline-flex w-full items-center justify-center rounded-radius-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary transition-colors hover:bg-primary-700"
                          >
                            {t("Open")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                        {loading ? t("Searching...") : t("No preview")}
                      </div>
                    )}
                  </aside>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
