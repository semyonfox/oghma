"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { documentKindSchema, type DocumentKind } from "@/lib/study-map/types";

export interface StudySearchProps {
  initialQuery?: string;
  onOpenMap?: (mapId: string, noteId: string) => void;
}

const sortSchema = z.enum(["relevance", "title", "updated", "topics"]);
const responseSchema = z.object({
  results: z.array(z.object({
    noteId: z.uuid(),
    title: z.string(),
    mapId: z.uuid(),
    mapName: z.string(),
    kind: documentKindSchema,
    labels: z.array(z.string()),
    topics: z.array(z.object({
      id: z.uuid(),
      name: z.string(),
      relevance: z.enum(["core", "supporting"]),
      status: z.enum(["suggested", "accepted"]),
    })),
    updatedAt: z.iso.datetime({ offset: true }),
    stale: z.boolean(),
    sourceNoteId: z.uuid(),
    references: z.array(z.object({
      id: z.uuid(),
      title: z.string(),
      kind: z.enum(["note", "file", "embedded"]),
    })),
  })).max(100),
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  nextOffset: z.number().int().min(0).max(50000).nullable(),
  availableFacets: z.object({
    maps: z.array(z.object({ id: z.uuid(), name: z.string(), count: z.number().int().nonnegative() })),
    topics: z.array(z.object({ id: z.uuid(), name: z.string(), mapId: z.uuid(), count: z.number().int().nonnegative() })),
    kinds: z.array(z.object({ kind: documentKindSchema, count: z.number().int().nonnegative() })),
    labels: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative() })),
  }),
});
type SearchResponse = z.infer<typeof responseSchema>;
type SearchResult = SearchResponse["results"][number];

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-primary-500 sm:text-sm";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md px-3 py-2 text-sm font-medium text-text hover:bg-primary-500/5 focus-visible:outline-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const linkClass =
  "inline-flex min-h-11 items-center text-sm text-primary-700 underline decoration-primary-500/30 underline-offset-4 hover:decoration-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-300";

function kindName(kind: DocumentKind): string {
  return kind === "past_paper" ? "Past paper" : kind === "worked_example" ? "Worked example" : kind.charAt(0).toUpperCase() + kind.slice(1);
}

function ResultCard({ result, onOpenMap }: { result: SearchResult; onOpenMap: StudySearchProps["onOpenMap"] }) {
  const mapHref = `/study-map?map=${encodeURIComponent(result.mapId)}&note=${encodeURIComponent(result.noteId)}`;
  return (
    <article className="min-w-0 space-y-3 rounded-radius-lg border border-border-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-base font-semibold text-text">
            <Link href={`/notes/${result.noteId}`} className="underline decoration-transparent underline-offset-4 hover:decoration-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500">{result.title || "Untitled note"}</Link>
          </h4>
          <p className="mt-1 text-xs text-text-tertiary">
            {kindName(result.kind)} · Updated <time dateTime={result.updatedAt}>{new Date(result.updatedAt).toLocaleDateString()}</time>
          </p>
        </div>
        {result.stale && <span className="rounded-radius-sm bg-surface px-2 py-1 text-xs font-medium text-text-secondary">Needs review</span>}
      </div>
      {result.topics.length > 0 && <ul aria-label="Topic assignments" className="flex flex-wrap gap-1.5">
        {result.topics.map((topic) => <li key={topic.id} className="rounded-radius-md bg-primary-500/5 px-2.5 py-1.5 text-xs leading-relaxed text-text-secondary">
          <span className="font-medium text-text">{topic.name}</span>{" "}<span>· {topic.relevance} · {topic.status}</span>
        </li>)}
      </ul>}
      {result.labels.length > 0 && <ul aria-label="Material labels" className="flex flex-wrap gap-1.5">
        {result.labels.map((label, index) => <li key={`${label}-${index}`} className="break-words rounded-radius-sm border border-border-subtle px-2 py-1 text-xs text-text-secondary">{label}{result.stale ? " · review label" : ""}</li>)}
      </ul>}
      {result.stale && <p className="text-xs leading-relaxed text-text-secondary">The source or topic definitions changed. Review the labels in the map. Current accepted corrections can still appear here.</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {onOpenMap ? <button type="button" className={`${buttonClass} -ml-3`} onClick={() => onOpenMap(result.mapId, result.noteId)}>View in study map</button> : <Link href={mapHref} className={linkClass}>View in study map</Link>}
        <Link href={`/notes/${result.noteId}`} className={linkClass}>Open original note</Link>
        {result.sourceNoteId !== result.noteId && <Link href={`/notes/${result.sourceNoteId}`} className={linkClass}>Open extracted text</Link>}
      </div>
      {result.references.length > 0 && <details className="border-t border-border-subtle pt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-xs text-text-secondary focus-visible:outline-2 focus-visible:outline-primary-500">{result.references.length} related {result.references.length === 1 ? "note or file" : "notes and files"}</summary>
        <ul className="space-y-1">{result.references.map((reference) => <li key={reference.id}><Link href={`/notes/${reference.id}`} className={`${linkClass} break-words`}>{reference.title || "Untitled note"}</Link></li>)}</ul>
      </details>}
    </article>
  );
}

export default function StudySearch({ initialQuery = "", onOpenMap }: StudySearchProps) {
  const id = useId();
  const [query, setQuery] = useState(initialQuery.slice(0, 200));
  const [mapId, setMapId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [kind, setKind] = useState<DocumentKind | "">("");
  const [label, setLabel] = useState("");
  const [sort, setSort] = useState<z.infer<typeof sortSchema>>("relevance");
  const [offset, setOffset] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: SearchResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const params = new URLSearchParams({ sort, limit: "50", offset: String(offset) });
  if (query.trim()) params.set("q", query.trim());
  if (mapId) params.set("mapId", mapId);
  if (topicId) params.set("topicId", topicId);
  if (kind) params.set("kind", kind);
  if (label) params.set("label", label);
  const requestKey = params.toString();
  const ready = response?.key === requestKey;
  const failed = error?.key === requestKey;
  const loading = !ready && !failed;
  const facets = response?.data.availableFacets;
  const topicChoices = facets?.topics.filter((topic) => !mapId || topic.mapId === mapId) ?? [];
  const activeFilterCount = [mapId, topicId, kind, label].filter(Boolean).length;

  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/study-maps/search?${requestKey}`, { signal: request.signal, cache: "no-store" }).then(async (result) => {
        if (!result.ok) throw new Error("Search unavailable");
        const body: unknown = await result.json();
        const data = responseSchema.parse(body);
        if (!request.signal.aborted) {
          setResponse({ key: requestKey, data });
          setError(null);
        }
      }).catch(() => {
        if (!request.signal.aborted) setError({ key: requestKey, message: "Your materials could not be searched. Try again." });
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [requestKey, retry]);

  function clearFilters() {
    setMapId("");
    setTopicId("");
    setKind("");
    setLabel("");
    setOffset(0);
  }

  const groups = new Map<string, { name: string; results: SearchResult[] }>();
  if (ready && response) {
    for (const result of response.data.results) {
      const group = groups.get(result.mapId) ?? { name: result.mapName, results: [] };
      group.results.push(result);
      groups.set(result.mapId, group);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-5 text-text">
      <header>
        <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">Search study materials</h2>
        <p className="mt-1 text-sm text-text-secondary">Find materials across your modules.</p>
      </header>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-query`}>Search notes, topics, aliases and labels
          <input id={`${id}-query`} className={fieldClass} type="search" maxLength={200} value={query} placeholder="Try trees, revision, or a topic alias" onChange={(event) => { setQuery(event.target.value); setOffset(0); }} />
        </label>
        <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-sort`}>Sort results
          <select id={`${id}-sort`} className={fieldClass} value={sort} onChange={(event) => {
            const value = sortSchema.safeParse(event.target.value);
            if (value.success) { setSort(value.data); setOffset(0); }
          }}>
            <option value="relevance">Relevance</option><option value="title">Title</option><option value="updated">Recently updated</option><option value="topics">Topic count</option>
          </select>
        </label>
      </div>
      <div className="space-y-3 rounded-radius-lg border border-border-subtle p-3">
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <button type="button" className={buttonClass} aria-expanded={filtersOpen} aria-controls={`${id}-filters`} onClick={() => setFiltersOpen(!filtersOpen)}>{filtersOpen ? "Hide filters" : "Show filters"}{activeFilterCount > 0 ? ` · ${activeFilterCount} applied` : ""}</button>
          {activeFilterCount > 0 && <button type="button" className={buttonClass} onClick={clearFilters}>Clear filters</button>}
        </div>
        <div id={`${id}-filters`} className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4`}>
          <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-module`}>Module
            <select id={`${id}-module`} className={fieldClass} value={mapId} onChange={(event) => { setMapId(event.target.value); setTopicId(""); setOffset(0); }}>
              <option value="">All modules</option>
              {facets?.maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.count}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-topic`}>Topic
            <select id={`${id}-topic`} className={fieldClass} value={topicId} onChange={(event) => { setTopicId(event.target.value); setOffset(0); }}>
              <option value="">All topics</option>
              {topicChoices.map((topic) => <option key={`${topic.mapId}:${topic.id}`} value={topic.id}>{topic.name}{!mapId ? ` · ${facets?.maps.find((map) => map.id === topic.mapId)?.name ?? "Module"}` : ""} · {topic.count}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-kind`}>Document kind
            <select id={`${id}-kind`} className={fieldClass} value={kind} onChange={(event) => {
              const value = documentKindSchema.safeParse(event.target.value);
              setKind(value.success ? value.data : ""); setOffset(0);
            }}>
              <option value="">All kinds</option>
              {facets?.kinds.map((entry) => <option key={entry.kind} value={entry.kind}>{kindName(entry.kind)} · {entry.count}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text-secondary" htmlFor={`${id}-label`}>Label
            <select id={`${id}-label`} className={fieldClass} value={label} onChange={(event) => { setLabel(event.target.value); setOffset(0); }}>
              <option value="">All labels</option>
              {facets?.labels.map((entry) => <option key={entry.label} value={entry.label}>{entry.label} · {entry.count}</option>)}
            </select>
          </label>
        </div>
        {activeFilterCount > 0 && <button type="button" className={`${buttonClass} hidden sm:inline-flex`} onClick={clearFilters}>Clear filters</button>}
        <p className="text-xs leading-relaxed text-text-tertiary">Filter counts cover all materials in your study maps. Topic choices follow the selected module.</p>
      </div>

      {loading && <p role="status" className="rounded-radius-lg bg-surface p-4 text-sm text-text-secondary">Searching your study maps...</p>}
      {failed && <div className="flex flex-wrap items-center gap-3 rounded-radius-lg border border-border-subtle p-4">
        <p role="alert" className="text-sm text-text-secondary">{error.message}</p><button type="button" className={buttonClass} onClick={() => { setError(null); setRetry((current) => current + 1); }}>Retry search</button>
      </div>}
      {ready && response && <>
        <p role="status" className="text-sm tabular-nums text-text-secondary">Showing {response.data.results.length > 0 ? `${offset + 1} to ${offset + response.data.results.length}` : "0"} of {response.data.total} {response.data.total === 1 ? "match" : "matches"} across {groups.size} {groups.size === 1 ? "module" : "modules"} on this page. A note linked to several modules appears in each module.</p>
        {response.data.results.length === 0 ? <div className="space-y-2 rounded-radius-lg border border-border-subtle p-5">
          <p className="font-medium">No materials match this search.</p>
          <p className="text-sm text-text-secondary">Try a shorter search or fewer filters. Materials appear here after they have been added to a study map.</p>
          {activeFilterCount > 0 && <button type="button" className={buttonClass} onClick={clearFilters}>Clear filters</button>}
        </div> : [...groups].map(([groupId, group]) => <section key={groupId} aria-labelledby={`${id}-${groupId}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle pb-2">
            <h3 id={`${id}-${groupId}`} className="break-words text-lg font-semibold tracking-tight">{group.name}</h3><p className="text-xs tabular-nums text-text-tertiary">{group.results.length} returned</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">{group.results.map((result) => <ResultCard key={`${result.mapId}:${result.noteId}`} result={result} onOpenMap={onOpenMap} />)}</div>
        </section>)}
        {(offset > 0 || response.data.nextOffset !== null) && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <button type="button" className={`${buttonClass} border border-border-subtle`} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - response.data.limit))}>Previous page</button>
          <span className="text-xs tabular-nums text-text-secondary">Page {Math.floor(offset / response.data.limit) + 1}</span>
          <button type="button" className={`${buttonClass} border border-border-subtle`} disabled={response.data.nextOffset === null} onClick={() => { if (response.data.nextOffset !== null) setOffset(response.data.nextOffset); }}>Next page</button>
        </div>}
      </>}
    </section>
  );
}
