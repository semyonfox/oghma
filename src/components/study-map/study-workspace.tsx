"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { z } from "zod";
import useSwipeDismiss from "@/components/navigation/use-swipe-dismiss";
import StudyCanvas, { type FlowScope } from "./study-canvas";
import StudyInspector from "./study-inspector";
import StudyExams from "./study-exams";
import StudySearch from "./study-search";
import {
  messageFor,
  requestJson,
  snapshotSchema,
  summarySchema,
} from "./study-client";
import {
  currentAcademicYear,
  documentKinds,
  documentKindSchema,
  effectiveAssociations,
  mapCreateSchema,
  mapUpdateSchema,
  topicSchema,
  type StudyMap,
  type StudyMapSnapshot,
  type StudyMapSummary,
  type StudyMaterial,
  type StudyTopic,
} from "@/lib/study-map/types";

export interface StudyWorkspaceProps {
  initialMaps: StudyMapSummary[];
  initialMapId?: string | null;
  initialNoteId?: string | null;
}

type Selection = { kind: "note" | "topic"; id: string };
type MapFields = z.infer<typeof mapCreateSchema> & { autoClassify: boolean };
const workspaceTabs = [
  { id: "canvas", name: "Map" },
  { id: "materials", name: "Materials" },
  { id: "exams", name: "Exam history" },
] as const;
type WorkspaceTab = (typeof workspaceTabs)[number]["id"];
type TabPreference = { chosen: WorkspaceTab | null };
const clearedFilters = {
  q: null,
  kind: null,
  label: null,
  topic: null,
  status: null,
  sort: null,
};

function updateLocation(parameters: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
const noteSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  isFolder: z.boolean(),
});
type LibraryNote = z.infer<typeof noteSchema>;
const fieldClass =
  "min-h-11 w-full min-w-0 rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50 md:text-sm";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = `${buttonClass} border border-border-subtle bg-surface text-text hover:bg-primary-500/5`;
const primaryClass = `${buttonClass} bg-primary-600 text-text-on-primary hover:bg-primary-700`;
const dangerClass = `${buttonClass} text-error-700 hover:bg-error-500/10 dark:text-error-300`;
const errorClass =
  "break-words rounded-radius-md bg-error-500/10 p-3 text-sm text-error-700 dark:text-error-300";

function defaultFields(): MapFields {
  return {
    name: "",
    academicYear: currentAcademicYear(),
    rootNoteId: null,
    canvasCourseId: null,
    syllabusNoteId: null,
    autoClassify: false,
  };
}

function useLibrarySearch(query: string, enabled: boolean) {
  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          fields: "id,title,isFolder",
          limit: "200",
        });
        if (query.trim()) params.set("q", query.trim());
        const data = await requestJson(`/api/notes?${params}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setNotes(noteSchema.array().parse(data));
      } catch (error) {
        if (!controller.signal.aborted) setError(messageFor(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, enabled]);
  return { notes, loading, error };
}

function SourcePicker({
  label,
  folder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  folder: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosenTitle, setChosenTitle] = useState<string | null>(null);
  const { notes, loading, error } = useLibrarySearch(query, open);
  const options = notes.filter((note) => note.isFolder === folder);
  const selectedTitle =
    notes.find((note) => note.id === value)?.title ?? chosenTitle;
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${secondaryClass} max-w-full min-w-0 break-words text-left`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {value
            ? selectedTitle || `Change selected ${folder ? "folder" : "note"}`
            : `Choose ${folder ? "folder" : "note"}`}
        </button>
        {value && (
          <button
            type="button"
            className={secondaryClass}
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setChosenTitle(null);
            }}
          >
            Clear {folder ? "folder" : "note"}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 rounded-radius-lg border border-border-subtle p-3">
          <label className="block space-y-1 text-sm">
            Search {folder ? "folders" : "notes"} by title
            <input
              className={fieldClass}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={disabled}
            />
          </label>
          {loading && (
            <p role="status" className="text-xs text-text-tertiary">
              Searching library...
            </p>
          )}
          {error && (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          )}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {options.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`${buttonClass} w-full justify-start break-words text-left ${value === note.id ? "bg-primary-500/10" : "hover:bg-primary-500/5"}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(note.id);
                    setChosenTitle(note.title || "Untitled");
                    setOpen(false);
                  }}
                >
                  {note.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
          {!loading && !error && options.length === 0 && (
            <p className="text-sm text-text-tertiary">
              No {folder ? "folders" : "notes"} found. Try a different title.
            </p>
          )}
          <p className="text-xs text-text-tertiary">
            Recent library items are shown first. Search by title to find older
            items.
          </p>
        </div>
      )}
    </div>
  );
}

function MapForm({
  initial,
  creating,
  busy,
  onSave,
  onCancel,
}: {
  initial?: StudyMap;
  creating: boolean;
  busy: boolean;
  onSave: (fields: MapFields, version?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [version] = useState(initial?.version);
  const [fields, setFields] = useState<MapFields>(() =>
    initial
      ? {
          name: initial.name,
          academicYear: initial.academicYear,
          rootNoteId: initial.rootNoteId,
          syllabusNoteId: initial.syllabusNoteId,
          canvasCourseId: initial.canvasCourseId,
          autoClassify: initial.autoClassify,
        }
      : defaultFields(),
  );
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = mapCreateSchema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the module details.");
      return;
    }
    setError(null);
    try {
      await onSave(
        { ...parsed.data, autoClassify: fields.autoClassify },
        version,
      );
    } catch (error) {
      setError(messageFor(error));
    }
  }
  return (
    <form
      onSubmit={(event) => void save(event)}
      className="space-y-4 rounded-radius-xl border border-border-subtle bg-surface p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold">
        {creating ? "Add a module" : "Module settings"}
      </h2>
      {creating && (
        <p className="text-sm text-text-secondary">
          Imported Canvas courses get a module automatically. For anything else,
          name it and pick the folder its notes live in. The syllabus and topics
          are found for you.
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className={creating ? "" : "grid gap-4 sm:grid-cols-2"}>
          <label className="block space-y-1 text-sm font-medium">
            Module name
            <input
              className={fieldClass}
              required
              maxLength={160}
              value={fields.name}
              placeholder="CS310 · Operating systems"
              onChange={(event) =>
                setFields({ ...fields, name: event.target.value })
              }
            />
          </label>
          {!creating && (
            <label className="block space-y-1 text-sm font-medium">
              Academic year
              <input
                className={fieldClass}
                required
                maxLength={40}
                value={fields.academicYear}
                onChange={(event) =>
                  setFields({ ...fields, academicYear: event.target.value })
                }
              />
            </label>
          )}
        </div>
        <SourcePicker
          label="Notes folder"
          folder
          value={fields.rootNoteId}
          onChange={(rootNoteId) => setFields({ ...fields, rootNoteId })}
          disabled={busy}
        />
        <p className="text-xs text-text-tertiary">
          Everything in this folder joins the module, including notes added
          later.
        </p>
        {!creating && (
          <SourcePicker
            label="Syllabus"
            folder={false}
            value={fields.syllabusNoteId}
            onChange={(syllabusNoteId) =>
              setFields({ ...fields, syllabusNoteId })
            }
            disabled={busy}
          />
        )}
        {!creating && (
          <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={fields.autoClassify}
              className="mt-1 h-4 w-4 accent-primary-600"
              onChange={(event) =>
                setFields({ ...fields, autoClassify: event.target.checked })
              }
            />
            <span>
              <span className="block font-medium">
                Keep this module organised automatically
              </span>
              <span className="text-text-secondary">
                New and changed notes are sorted into topics in the background.
                Your own corrections are always kept.
              </span>
            </span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryClass}>
            {busy ? "Saving..." : creating ? "Add module" : "Save settings"}
          </button>
          <button type="button" className={secondaryClass} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

function AddMaterials({
  snapshot,
  busy,
  onAdd,
  onClose,
}: {
  snapshot: StudyMapSnapshot;
  busy: boolean;
  onAdd: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { notes, loading, error: searchError } = useLibrarySearch(query, true);
  const existing = new Set(
    snapshot.materials.map((material) => material.noteId),
  );
  async function add() {
    setError(null);
    try {
      await onAdd(selected);
      onClose();
    } catch (error) {
      setError(messageFor(error));
    }
  }
  return (
    <section className="space-y-3 rounded-radius-xl border border-border-subtle bg-surface p-4">
      <h2 className="text-base font-semibold">Add notes and files</h2>
      <label className="block space-y-1 text-sm">
        Search library by title
        <input
          className={fieldClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={busy}
        />
      </label>
      <p className="text-xs text-text-tertiary">
        Recent items are shown first. Search to find older notes. Select up to
        100 at once.
      </p>
      {loading && (
        <p role="status" className="text-sm text-text-tertiary">
          Searching library...
        </p>
      )}
      <ul className="max-h-64 overflow-y-auto divide-y divide-border-subtle">
        {notes
          .filter((note) => !note.isFolder)
          .map((note) => (
            <li key={note.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-primary-600"
                  checked={selected.includes(note.id)}
                  disabled={
                    busy ||
                    existing.has(note.id) ||
                    (!selected.includes(note.id) && selected.length >= 100)
                  }
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, note.id]
                        : current.filter((id) => id !== note.id),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {note.title || "Untitled"}
                  {existing.has(note.id) && (
                    <span className="block text-xs text-text-tertiary">
                      Already in this module
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
      </ul>
      {!loading && notes.every((note) => note.isFolder) && (
        <p className="text-sm text-text-tertiary">
          No notes found. Try another title.
        </p>
      )}
      {(error || searchError) && (
        <p role="alert" className={errorClass}>
          {error || searchError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={busy || selected.length === 0}
          onClick={() => void add()}
        >
          {busy
            ? "Adding..."
            : `Add ${selected.length || "selected"} ${selected.length === 1 ? "material" : "materials"}`}
        </button>
        <button
          type="button"
          className={secondaryClass}
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function ManualTopic({
  busy,
  onAdd,
  onClose,
}: {
  busy: boolean;
  onAdd: (topic: StudyTopic) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = topicSchema.safeParse({
      id: crypto.randomUUID(),
      name,
      definition,
      sources: [],
      reviewed: false,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the topic details.");
      return;
    }
    setError(null);
    try {
      await onAdd(parsed.data);
      onClose();
    } catch (error) {
      setError(messageFor(error));
    }
  }
  return (
    <form
      onSubmit={(event) => void save(event)}
      className="space-y-3 rounded-radius-xl border border-border-subtle bg-surface p-4"
    >
      <h2 className="text-base font-semibold">Add your own topic</h2>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block space-y-1 text-sm">
          Topic name
          <input
            className={fieldClass}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Definition
          <textarea
            className={fieldClass}
            required
            maxLength={2000}
            rows={3}
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
          />
        </label>
        <p className="text-xs text-text-tertiary">
          This is your definition. No source citation is required. Open the
          topic to set its scope and approve it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryClass}>
            {busy ? "Saving..." : "Add topic"}
          </button>
          <button type="button" className={secondaryClass} onClick={onClose}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </form>
  );
}

function reviewState(material: StudyMaterial, taxonomyVersion: number): string {
  if (material.status === "failed") return "failed";
  if (
    material.status === "stale" ||
    material.taxonomyEvidenceStale ||
    (material.sourceHash && material.sourceHash !== material.currentHash) ||
    (material.classifiedAt && material.taxonomyVersion !== taxonomyVersion)
  )
    return "stale";
  const overridesCurrent =
    !material.taxonomyEvidenceStale &&
    material.overrides.sourceHash === material.currentHash &&
    material.overrides.taxonomyVersion === taxonomyVersion;
  if (
    overridesCurrent &&
    (material.overrides.kind !== undefined ||
      material.overrides.labels !== undefined ||
      Object.keys(material.overrides.topics).length > 0)
  )
    return "reviewed";
  if (material.status === "unclassified") return "unclassified";
  return "suggested";
}

const reviewLabels: Record<string, string> = {
  reviewed: "Reviewed by you",
  suggested: "Suggestions to review",
  stale: "Needs fresh review",
  unclassified: "Not classified",
  failed: "Classification failed",
};

function MaterialList({
  snapshot,
  onSelect,
  selected,
}: {
  snapshot: StudyMapSnapshot;
  onSelect: (selection: Selection) => void;
  selected: Selection | null;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [label, setLabel] = useState("");
  const [topic, setTopic] = useState("");
  const [state, setState] = useState("");
  const [sort, setSort] = useState("title");
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setQuery(parameters.get("q") ?? "");
    const restoredKind = documentKindSchema.safeParse(parameters.get("kind"));
    setKind(restoredKind.success ? restoredKind.data : "");
    setLabel(parameters.get("label") ?? "");
    const restoredTopic = parameters.get("topic") ?? "";
    setTopic(
      restoredTopic === "unassigned" ||
        z.uuid().safeParse(restoredTopic).success
        ? restoredTopic
        : "",
    );
    const restoredState = parameters.get("status") ?? "";
    setState(Object.hasOwn(reviewLabels, restoredState) ? restoredState : "");
    const restoredSort = parameters.get("sort");
    setSort(
      restoredSort === "updated" || restoredSort === "review"
        ? restoredSort
        : "title",
    );
  }, []);
  const labels = [
    ...new Set(snapshot.materials.flatMap((material) => material.labels)),
  ].sort();
  const materials = snapshot.materials
    .filter((material) => {
      const associations = effectiveAssociations(
        material,
        snapshot.map.taxonomyVersion,
      );
      return (
        (!query.trim() ||
          `${material.title} ${material.excerpt} ${material.labels.join(" ")}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())) &&
        (!kind || material.kind === kind) &&
        (!label || material.labels.includes(label)) &&
        (!topic ||
          (topic === "unassigned"
            ? associations.length === 0
            : associations.some((entry) => entry.topicId === topic))) &&
        (!state ||
          reviewState(material, snapshot.map.taxonomyVersion) === state)
      );
    })
    .sort((left, right) =>
      sort === "updated"
        ? right.updatedAt.localeCompare(left.updatedAt)
        : sort === "review"
          ? reviewState(left, snapshot.map.taxonomyVersion).localeCompare(
              reviewState(right, snapshot.map.taxonomyVersion),
            ) || left.title.localeCompare(right.title)
          : left.title.localeCompare(right.title),
    );
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="block space-y-1 text-sm">
          Search materials
          <input
            className={fieldClass}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              updateLocation({ q: event.target.value });
            }}
            placeholder="Title, excerpt or label"
          />
        </label>
        <label className="block space-y-1 text-sm">
          Document kind
          <select
            className={fieldClass}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              updateLocation({ kind: event.target.value });
            }}
          >
            <option value="">All kinds</option>
            {documentKinds.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Label
          <select
            className={fieldClass}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              updateLocation({ label: event.target.value });
            }}
          >
            <option value="">All labels</option>
            {labels.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Topic
          <select
            className={fieldClass}
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              updateLocation({ topic: event.target.value });
            }}
          >
            <option value="">All topics</option>
            <option value="unassigned">No topic assignment</option>
            {snapshot.map.topics.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Review state
          <select
            className={fieldClass}
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              updateLocation({ status: event.target.value });
            }}
          >
            <option value="">All review states</option>
            {Object.entries(reviewLabels).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Sort by
          <select
            className={fieldClass}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              updateLocation({
                sort:
                  event.target.value === "title" ? null : event.target.value,
              });
            }}
          >
            <option value="title">Title</option>
            <option value="updated">Recently updated</option>
            <option value="review">Review state</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-text-tertiary">
        {materials.length} of {snapshot.materials.length} materials
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {materials.map((material) => {
          const associations = effectiveAssociations(
            material,
            snapshot.map.taxonomyVersion,
          );
          return (
            <li
              key={material.noteId}
              className={`rounded-radius-lg border bg-surface p-4 ${selected?.kind === "note" && selected.id === material.noteId ? "border-primary-500" : "border-border-subtle"}`}
            >
              <button
                type="button"
                className="w-full rounded-radius-md text-left focus-visible:outline-2 focus-visible:outline-primary-500"
                onClick={() => onSelect({ kind: "note", id: material.noteId })}
              >
                <span className="block break-words text-base font-semibold">
                  {material.title || "Untitled note"}
                </span>
                <span className="mt-1 block text-xs text-text-tertiary">
                  {material.kind.replaceAll("_", " ")} ·{" "}
                  {
                    reviewLabels[
                      reviewState(material, snapshot.map.taxonomyVersion)
                    ]
                  }
                </span>
                <span className="mt-2 block line-clamp-2 break-words text-sm text-text-secondary">
                  {material.excerpt ||
                    "Open the original to read this material."}
                </span>
              </button>
              {material.labels.length > 0 && (
                <p className="mt-2 break-words text-xs text-text-tertiary">
                  {material.labels.join(" · ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {associations.map((association) => {
                  const entry = snapshot.map.topics.find(
                    (value) => value.id === association.topicId,
                  );
                  return entry ? (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${buttonClass} bg-primary-500/5 text-xs`}
                      onClick={() => onSelect({ kind: "topic", id: entry.id })}
                    >
                      {entry.name}
                      {association.status === "suggested" ? " · suggested" : ""}
                    </button>
                  ) : null;
                })}
                <Link
                  href={`/notes/${material.noteId}`}
                  className={`${buttonClass} text-primary-700 underline underline-offset-4 dark:text-primary-300`}
                >
                  Open original
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {materials.length === 0 && (
        <p className="rounded-radius-lg border border-border-subtle p-5 text-sm text-text-secondary">
          {snapshot.materials.length === 0
            ? "Add notes and files, or sync your source folder, to start organising this module."
            : "No materials match these filters."}
        </p>
      )}
    </section>
  );
}

type ActiveJob = StudyMapSnapshot["jobs"][number];

/** one line saying what the automatic setup is doing, or offering the one action it could use */
function describeSetup(
  snapshot: StudyMapSnapshot,
  activeJobs: ActiveJob[],
): { text: string; action?: "find" | "find-now" } | null {
  const { map, provider } = snapshot;
  if (activeJobs.some((job) => job.kind === "taxonomy"))
    return { text: "Reading this module's material to find its topics..." };
  const sorting = activeJobs.filter((job) => job.kind === "classify").length;
  if (sorting > 0)
    return {
      text: `Sorting ${sorting} ${sorting === 1 ? "note" : "notes"} into topics. The map fills in as they finish.`,
    };
  if (map.topics.length > 0) return null;
  if (snapshot.materials.length === 0)
    return {
      text:
        map.rootNoteId || map.canvasCourseId
          ? "Waiting for this module's notes to arrive."
          : "This module has no notes yet. Add materials or choose its notes folder in Module settings.",
    };
  if (!provider.generationReady)
    return {
      text: "Topic suggestions are unavailable right now. Notes are laid out by week, and you can add topics yourself under Topics.",
    };
  const proposal = snapshot.jobs.find((job) => job.kind === "taxonomy");
  if (proposal?.state === "failed")
    return {
      text: `Topics could not be found. ${proposal.error ?? ""}`,
      action: "find",
    };
  if (proposal)
    return {
      text: "No topics were found in this module's material. Add one yourself under Topics, or try again.",
      action: "find",
    };
  return {
    text: map.autoClassify
      ? "Notes are laid out by week. Topics are found automatically once the course finishes importing."
      : "Notes are laid out by week. Find topics to group them.",
    action: map.autoClassify ? "find-now" : "find",
  };
}

function ModuleWorkspace({
  mapId,
  initialNoteId,
  noteRequest,
  tabPreference,
  maps,
  scope,
  onScopeChange,
  onOpenModule,
  onRefreshMaps,
  onDeleted,
  onBusyChange,
}: {
  mapId: string;
  initialNoteId?: string | null;
  noteRequest: number;
  tabPreference: TabPreference;
  maps: StudyMapSummary[];
  scope: FlowScope;
  onScopeChange: (scope: FlowScope) => void;
  onOpenModule: (mapId: string, noteId?: string | null) => void;
  onRefreshMaps: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<StudyMapSnapshot | null>(null);
  const snapshotRef = useRef(snapshot);
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const operationRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>(
    tabPreference.chosen ?? "canvas",
  );
  const [selection, setSelection] = useState<Selection | null>(
    initialNoteId ? { kind: "note", id: initialNoteId } : null,
  );
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [topicForm, setTopicForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [wide, setWide] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState<boolean | null>(null);
  const [boardFocused, setBoardFocused] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const tabId = useId();
  const closeInspector = useCallback(() => {
    setSelection(null);
    updateLocation({ note: null });
  }, []);
  const selectInspector = useCallback((selection: Selection | null) => {
    setSelection(selection);
    updateLocation({ note: selection?.kind === "note" ? selection.id : null });
  }, []);
  function chooseTab(tab: WorkspaceTab) {
    tabPreference.chosen = tab;
    setTab(tab);
    setBoardFocused(false);
    updateLocation({ tab });
  }
  useEffect(() => {
    const restored = new URLSearchParams(window.location.search).get("tab");
    const initial =
      workspaceTabs.find((entry) => entry.id === restored)?.id ??
      tabPreference.chosen ??
      "canvas";
    setTab(initial);
    updateLocation({ tab: initial });
  }, [tabPreference]);
  useEffect(() => {
    if (!boardFocused && !(wide && selection)) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (selection && wide) closeInspector();
      else setBoardFocused(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [boardFocused, closeInspector, selection, wide]);

  const inspectorReady = snapshot !== null;
  useEffect(() => {
    if (!selection || !wide || !inspectorReady) return;
    const previous = document.activeElement;
    const panel = inspectorRef.current;
    panel
      ?.querySelector<HTMLButtonElement>('[aria-label="Close inspector"]')
      ?.focus();
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (panel?.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        previous.focus();
    };
  }, [inspectorReady, selection, tab, wide]);

  const swipe = useSwipeDismiss({
    open: selection !== null && !wide,
    onClose: closeInspector,
  });

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++requestSequence.current;
      const incoming = snapshotSchema.parse(
        await requestJson(`/api/study-maps/${mapId}`, { signal }),
      );
      if (
        !mounted.current ||
        signal?.aborted ||
        sequence !== requestSequence.current
      )
        return;
      snapshotRef.current = incoming;
      setSnapshot(incoming);
    },
    [mapId],
  );

  useEffect(() => {
    if (initialNoteId) setSelection({ kind: "note", id: initialNoteId });
  }, [initialNoteId, noteRequest]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void refresh(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setError(messageFor(error));
    });
    const media = window.matchMedia("(min-width: 1280px)");
    const updateWide = () => setWide(media.matches);
    updateWide();
    media.addEventListener("change", updateWide);
    return () => {
      mounted.current = false;
      controller.abort();
      media.removeEventListener("change", updateWide);
    };
  }, [refresh]);

  const hasActiveJobs =
    snapshot?.jobs.some(
      (job) => job.state === "pending" || job.state === "running",
    ) ?? false;
  useEffect(() => {
    if (!hasActiveJobs) return;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling || operationRef.current) return;
      polling = true;
      try {
        await refresh();
      } catch (error) {
        if (mounted.current) setError(messageFor(error));
      } finally {
        polling = false;
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, refresh]);

  async function operate(
    name: string,
    operation: () => Promise<void>,
    success: string,
    reload = true,
  ) {
    if (operationRef.current)
      throw new Error("Another change is being saved. Wait for it to finish.");
    operationRef.current = true;
    setBusy(name);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      if (reload) {
        try {
          await refresh();
        } catch (error) {
          if (mounted.current)
            setError(
              `${success} The latest view could not be refreshed. ${messageFor(error)}`,
            );
        }
      }
      if (mounted.current) setMessage(success);
      try {
        await onRefreshMaps();
      } catch (error) {
        if (mounted.current)
          setError(
            `${success} The module list could not be refreshed. ${messageFor(error)}`,
          );
      }
    } catch (error) {
      if (mounted.current) setError(messageFor(error));
      throw error;
    } finally {
      operationRef.current = false;
      if (mounted.current) setBusy(null);
      onBusyChange(false);
    }
  }

  function launch(operation: Promise<void>) {
    void operation.catch(() => undefined);
  }

  function mutation(
    path: string,
    method: string,
    body: unknown,
    success: string,
  ) {
    return operate(
      path || "settings",
      async () => {
        await requestJson(`/api/study-maps/${mapId}${path}`, {
          method,
          body: JSON.stringify(body),
        });
      },
      success,
    );
  }

  async function saveTopics(topics: StudyTopic[]) {
    const current = snapshotRef.current;
    if (!current) throw new Error("The module is still loading.");
    await mutation(
      "/topics",
      "PUT",
      { version: current.map.version, topics },
      "Topics saved.",
    );
  }

  async function queue(
    kind: "taxonomy" | "classify" | "paper",
    noteId: string | null = null,
  ) {
    const current = snapshotRef.current;
    if (!current) throw new Error("The module is still loading.");
    if (
      kind !== "taxonomy" &&
      !current.map.topics.some((topic) => topic.reviewed)
    )
      throw new Error(
        "Approve at least one topic before processing materials.",
      );
    let queued = 0;
    await operate(
      kind,
      async () => {
        const result = z
          .object({ queued: z.number().int().nonnegative() })
          .parse(
            await requestJson(`/api/study-maps/${mapId}/jobs`, {
              method: "POST",
              body: JSON.stringify({ kind, noteId }),
            }),
          );
        queued = result.queued;
      },
      "Processing requested. Results will appear here for review.",
    );
    if (queued === 0)
      setMessage(
        "No new jobs were needed. Existing jobs and current materials are kept.",
      );
  }

  if (!snapshot)
    return (
      <section className="space-y-3 rounded-radius-xl border border-border-subtle p-5">
        {error ? (
          <>
            <p role="alert" className={errorClass}>
              {error}
            </p>
            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                void refresh().catch((error) => setError(messageFor(error)))
              }
            >
              Retry loading module
            </button>
          </>
        ) : (
          <p role="status" className="text-sm text-text-secondary">
            Loading module map...
          </p>
        )}
      </section>
    );
  const map = snapshot.map;
  const activeJobs = snapshot.jobs.filter(
    (job) => job.state === "pending" || job.state === "running",
  );
  const reviewedTopics = map.topics.filter((topic) => topic.reviewed).length;
  const setupStatus = describeSetup(snapshot, activeJobs);
  const inspector = selection && (
    <StudyInspector
      snapshot={snapshot}
      selection={selection}
      onClose={closeInspector}
      onReviewMaterial={(input) =>
        mutation("/materials", "PATCH", input, "Material corrections saved.")
      }
      onSaveTopics={saveTopics}
      onRemoveMaterial={(noteId) =>
        mutation(
          "/materials",
          "DELETE",
          { noteId },
          "Material removed from this map. Your original note is kept.",
        )
      }
      onClassify={(noteId) => queue("classify", noteId)}
    />
  );

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold">{map.name}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {map.academicYear} · {snapshot.materials.length} materials ·{" "}
            {map.topics.length} topics
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${secondaryClass} lg:min-h-8 lg:py-1`}
            disabled={busy !== null}
            aria-expanded={settings}
            onClick={() => setSettings((value) => !value)}
          >
            Module settings
          </button>
          <button
            type="button"
            className={`${primaryClass} lg:min-h-8 lg:py-1`}
            disabled={busy !== null}
            aria-expanded={adding}
            onClick={() => setAdding((value) => !value)}
          >
            Add materials
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-radius-md bg-primary-500/5 p-3 text-sm text-text-secondary"
        >
          {message}
        </p>
      )}
      {settings && (
        <div className="space-y-3">
          <MapForm
            key={map.id}
            initial={map}
            creating={false}
            busy={busy !== null}
            onCancel={() => setSettings(false)}
            onSave={async (fields, version) => {
              const parsed = mapUpdateSchema.parse({ ...fields, version });
              await mutation("", "PATCH", parsed, "Module settings saved.");
              setSettings(false);
            }}
          />
          <div className="space-y-2 rounded-radius-lg border border-border-subtle p-4">
            <p className="text-sm text-text-secondary">
              Deleting this module removes its map, topic definitions, and exam
              reviews. Your notes and files stay in the library.
            </p>
            {deleteConfirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  Delete this module map?
                </span>
                <button
                  type="button"
                  className={dangerClass}
                  disabled={busy !== null}
                  onClick={() =>
                    launch(
                      operate(
                        "delete",
                        async () => {
                          await requestJson(`/api/study-maps/${mapId}`, {
                            method: "DELETE",
                          });
                          await onDeleted();
                        },
                        "Module deleted.",
                        false,
                      ),
                    )
                  }
                >
                  Confirm deletion
                </button>
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={busy !== null}
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={dangerClass}
                disabled={busy !== null}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete module map
              </button>
            )}
          </div>
        </div>
      )}
      {adding && (
        <AddMaterials
          snapshot={snapshot}
          busy={busy !== null}
          onAdd={(noteIds) =>
            mutation("/materials", "POST", { noteIds }, "Materials added.")
          }
          onClose={() => setAdding(false)}
        />
      )}
      {initialNoteId &&
        !snapshot.materials.some(
          (material) => material.noteId === initialNoteId,
        ) && (
          <div className="flex flex-wrap items-center gap-3 rounded-radius-lg border border-border-subtle p-3">
            <p className="text-sm text-text-secondary">
              The note you opened is not in this module.
            </p>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy !== null}
              onClick={() =>
                launch(
                  mutation(
                    "/materials",
                    "POST",
                    { noteIds: [initialNoteId] },
                    "Note added to this module.",
                  ),
                )
              }
            >
              Add this note
            </button>
          </div>
        )}
      {setupStatus?.action && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-radius-lg border border-border-subtle bg-surface p-3 text-sm text-text-secondary"
        >
          <p className="min-w-0 flex-1 break-words">{setupStatus.text}</p>
          <button
            type="button"
            className={secondaryClass}
            disabled={busy !== null}
            onClick={() => launch(queue("taxonomy"))}
          >
            {setupStatus.action === "find-now"
              ? "Find topics now"
              : "Find topics"}
          </button>
        </div>
      )}
      <details
        open={topicsOpen ?? false}
        onToggle={(event) => setTopicsOpen(event.currentTarget.open)}
        className="rounded-radius-lg border border-border-subtle bg-surface"
      >
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-500">
          Topics
          <span className="ml-2 text-xs font-normal text-text-tertiary">
            {map.topics.length} topics
            {reviewedTopics < map.topics.length
              ? ` · ${map.topics.length - reviewedTopics} to check`
              : ""}
            {map.autoClassify ? " · organised automatically" : ""}
          </span>
          {/* progress lives in this always-present row so the map below never shifts while jobs run */}
          {setupStatus && !setupStatus.action && (
            <span
              role="status"
              className="ml-2 text-xs font-normal text-text-secondary"
            >
              · {setupStatus.text}
            </span>
          )}
        </summary>
        <div className="space-y-3 border-t border-border-subtle p-3">
          <div className="flex flex-wrap gap-2">
            {map.topics.length > 0 && snapshot.provider.generationReady && (
              <button
                type="button"
                className={secondaryClass}
                disabled={
                  busy !== null ||
                  activeJobs.some((job) => job.kind === "taxonomy")
                }
                onClick={() => launch(queue("taxonomy"))}
              >
                Find topics again
              </button>
            )}
            <button
              type="button"
              className={secondaryClass}
              disabled={busy !== null || map.topics.length >= 80}
              aria-expanded={topicForm}
              onClick={() => setTopicForm((value) => !value)}
            >
              Add a topic
            </button>
            {!map.autoClassify && (
              <>
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={
                    busy !== null || (!map.rootNoteId && !map.canvasCourseId)
                  }
                  onClick={() =>
                    launch(
                      mutation(
                        "/refresh",
                        "POST",
                        {},
                        "Source folder and course materials synced.",
                      ),
                    )
                  }
                >
                  Sync sources
                </button>
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={
                    busy !== null ||
                    !snapshot.provider.ready ||
                    reviewedTopics === 0 ||
                    snapshot.materials.length === 0 ||
                    activeJobs.some((job) => job.kind === "classify")
                  }
                  onClick={() => launch(queue("classify"))}
                >
                  Classify materials
                </button>
              </>
            )}
          </div>
          {topicForm && (
            <ManualTopic
              busy={busy !== null}
              onClose={() => setTopicForm(false)}
              onAdd={async (topic) => {
                await saveTopics([...map.topics, topic]);
                selectInspector({ kind: "topic", id: topic.id });
              }}
            />
          )}
          {map.topics.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {map.topics.map((topic) => (
                <li key={topic.id}>
                  <button
                    type="button"
                    className={`${secondaryClass} w-full justify-start text-left`}
                    onClick={() =>
                      selectInspector({ kind: "topic", id: topic.id })
                    }
                  >
                    <span className="min-w-0">
                      <span className="block break-words">{topic.name}</span>
                      <span className="block text-xs text-text-tertiary">
                        {topic.reviewed ? "In use" : "Check and approve"}
                        {topic.sources.length === 0
                          ? " · Your definition"
                          : " · From the syllabus"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!snapshot.provider.ready && (
            <p className="text-sm text-text-secondary">
              Automatic sorting is unavailable. You can organise materials and
              topics yourself.
            </p>
          )}
          {snapshot.jobs.some((job) => job.state === "failed") && (
            <details className="rounded-radius-lg border border-border-subtle p-3">
              <summary className="cursor-pointer text-sm text-text-secondary">
                Processing errors
              </summary>
              <ul className="mt-2 space-y-2">
                {snapshot.jobs
                  .filter((job) => job.state === "failed")
                  .map((job) => (
                    <li
                      key={job.id}
                      className="text-sm text-error-700 dark:text-error-300"
                    >
                      {job.kind === "taxonomy"
                        ? "Topic proposal"
                        : job.kind === "paper"
                          ? "Paper analysis"
                          : "Classification"}
                      {job.noteId
                        ? ` · ${snapshot.materials.find((material) => material.noteId === job.noteId)?.title || "Material"}`
                        : ""}
                      : {job.error || "Processing failed. Try again."}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      </details>
      <div className="flex min-w-0 items-end justify-between gap-3 border-b border-border-subtle">
        <div
          role="tablist"
          aria-label="Module view"
          className="flex flex-wrap gap-1"
          onKeyDown={(event) => {
            const tabs = workspaceTabs.map((entry) => entry.id);
            const index = tabs.indexOf(tab);
            const nextIndex =
              event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : null;
            if (nextIndex === null) return;
            event.preventDefault();
            const next = tabs[nextIndex];
            chooseTab(next);
            document.getElementById(`${tabId}-${next}-tab`)?.focus();
          }}
        >
          {workspaceTabs.map((entry) => (
            <button
              key={entry.id}
              id={`${tabId}-${entry.id}-tab`}
              type="button"
              role="tab"
              tabIndex={tab === entry.id ? 0 : -1}
              aria-selected={tab === entry.id}
              aria-controls={`${tabId}-${entry.id}-panel`}
              className={`${buttonClass} rounded-b-none lg:min-h-8 lg:py-1 ${tab === entry.id ? "border-b-2 border-primary-500 text-primary-700 dark:text-primary-300" : "text-text-secondary hover:bg-primary-500/5"}`}
              onClick={() => chooseTab(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-w-0">
        <div className="min-w-0">
          <section
            id={`${tabId}-canvas-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-canvas-tab`}
            hidden={tab !== "canvas"}
            className={
              tab !== "canvas"
                ? "hidden"
                : boardFocused
                  ? "fixed inset-0 z-[65] flex h-dvh min-h-0 flex-col gap-2 overflow-hidden bg-app-page p-3 text-text"
                  : "relative flex h-[calc(100dvh-20rem)] min-h-[520px] flex-col gap-2 lg:h-[calc(100dvh-16rem)]"
            }
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <StudyCanvas
                snapshot={snapshot}
                maps={maps}
                scope={scope}
                onScopeChange={onScopeChange}
                onReview={(reviewMap, noteId) => {
                  if (reviewMap === mapId)
                    selectInspector({ kind: "note", id: noteId });
                  else onOpenModule(reviewMap, noteId);
                }}
                onOpenModule={(target) => onOpenModule(target)}
                actions={
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center rounded-radius-md border border-border-subtle px-2.5 text-xs font-medium text-text-secondary hover:text-text"
                    aria-pressed={boardFocused}
                    onClick={() => setBoardFocused((value) => !value)}
                  >
                    {boardFocused ? "Exit full screen" : "Full screen"}
                  </button>
                }
              />
            </div>
            {selection && wide && tab === "canvas" && (
              <aside
                ref={inspectorRef}
                aria-label="Selected material or topic"
                className="glass-panel absolute bottom-3 right-3 top-24 z-30 w-[360px] overflow-y-auto overscroll-contain rounded-radius-xl p-4 shadow-lg"
              >
                {inspector}
              </aside>
            )}
          </section>
          <section
            id={`${tabId}-materials-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-materials-tab`}
            hidden={tab !== "materials"}
          >
            <MaterialList
              snapshot={snapshot}
              onSelect={selectInspector}
              selected={selection}
            />
          </section>
          <section
            id={`${tabId}-exams-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-exams-tab`}
            hidden={tab !== "exams"}
          >
            <StudyExams
              snapshot={snapshot}
              onAnalyse={(noteId) => queue("paper", noteId)}
              onSavePaper={(input) =>
                mutation("/papers", "PUT", input, "Exam review saved.")
              }
            />
          </section>
        </div>
        {selection && wide && tab !== "canvas" && (
          <aside
            ref={inspectorRef}
            aria-label="Selected material or topic"
            className="glass-panel absolute right-0 top-0 z-30 max-h-[calc(100dvh-12rem)] w-[360px] overflow-y-auto overscroll-contain rounded-radius-xl p-4 shadow-lg"
          >
            {inspector}
          </aside>
        )}
      </div>
      {!wide && (
        <Dialog
          open={selection !== null}
          onClose={closeInspector}
          className="relative z-[70]"
        >
          <DialogBackdrop className="fixed inset-0 bg-black/40" />
          <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
            <DialogPanel
              {...swipe}
              className="max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-radius-xl border border-border-subtle bg-surface p-4 pb-[max(1rem,var(--safe-bottom))] text-text sm:rounded-radius-xl"
            >
              <DialogTitle className="sr-only">Study map inspector</DialogTitle>
              {inspector}
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </section>
  );
}

export default function StudyWorkspace({
  initialMaps,
  initialMapId,
  initialNoteId,
}: StudyWorkspaceProps) {
  const [maps, setMaps] = useState(initialMaps);
  const [mapId, setMapId] = useState(initialMapId ?? initialMaps[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  // imported courses become modules on open; only an empty result shows the manual form
  const [settingUp, setSettingUp] = useState(true);
  const [searching, setSearching] = useState(false);
  const [noteId, setNoteId] = useState(initialNoteId);
  const [noteRequest, setNoteRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<FlowScope>("module");
  const tabPreference = useMemo<TabPreference>(() => ({ chosen: null }), []);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const restoredMap = z.uuid().safeParse(parameters.get("map"));
    const restoredNote = z.uuid().safeParse(parameters.get("note"));
    if (restoredMap.success) setMapId(restoredMap.data);
    if (restoredNote.success) setNoteId(restoredNote.data);
    if (parameters.get("scope") === "all") setScope("all");
    updateLocation({ map: restoredMap.success ? restoredMap.data : mapId });
  }, [mapId]);

  const refreshMaps = useCallback(async () => {
    const incoming = summarySchema
      .array()
      .parse(await requestJson("/api/study-maps"));
    setMaps(incoming);
  }, []);

  // a ref rather than a cancel flag: strict mode reruns the effect, and the
  // first request may already have created the modules the second one would miss
  const setupStarted = useRef(false);
  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;
    void (async () => {
      try {
        const { created } = z
          .object({ created: z.number().int().nonnegative() })
          .parse(
            await requestJson("/api/study-maps/setup", {
              method: "POST",
              body: "{}",
            }),
          );
        if (created === 0) return;
        const incoming = summarySchema
          .array()
          .parse(await requestJson("/api/study-maps"));
        setMaps(incoming);
        setMapId((current) => current || incoming[0]?.id || "");
        setMessage(
          `Added ${created} ${created === 1 ? "module" : "modules"} from your Canvas courses.`,
        );
      } catch (error) {
        setError(messageFor(error));
      } finally {
        setSettingUp(false);
      }
    })();
  }, []);

  async function create(fields: MapFields) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = z
        .object({ mapId: z.uuid(), warning: z.string().nullable() })
        .parse(
          await requestJson("/api/study-maps", {
            method: "POST",
            body: JSON.stringify(mapCreateSchema.parse(fields)),
          }),
        );
      await refreshMaps();
      updateLocation({ map: result.mapId, note: null, ...clearedFilters });
      setNoteId(null);
      setMapId(result.mapId);
      setCreating(false);
      if (result.warning)
        setMessage(
          `Module created. Source sync needs attention: ${result.warning}`,
        );
    } catch (error) {
      setError(messageFor(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function deleted() {
    const incoming = summarySchema
      .array()
      .parse(await requestJson("/api/study-maps"));
    setMaps(incoming);
    updateLocation({
      map: incoming[0]?.id ?? null,
      note: null,
      ...clearedFilters,
    });
    setNoteId(null);
    setMapId(incoming[0]?.id ?? "");
  }

  return (
    <main className="min-w-0 space-y-3 bg-app-page p-3 pb-28 text-text sm:p-4 lg:pb-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight">
          Study maps
        </h1>
        {maps.length > 0 && (
          <label className="block min-w-[12rem] flex-1 text-sm font-medium sm:max-w-sm">
            <span className="sr-only">Module</span>
            <select
              className={`${fieldClass} lg:min-h-8 lg:py-1`}
              value={mapId}
              disabled={busy}
              onChange={(event) => {
                updateLocation({
                  map: event.target.value,
                  note: null,
                  ...clearedFilters,
                });
                setMapId(event.target.value);
                setNoteId(null);
                setSearching(false);
                setCreating(false);
                setError(null);
                setMessage(null);
              }}
            >
              {!maps.some((map) => map.id === mapId) && mapId && (
                <option value={mapId}>Selected module</option>
              )}
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name} · {map.academicYear}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${secondaryClass} lg:min-h-8 lg:py-1`}
            disabled={busy}
            onClick={() => {
              setSearching((value) => !value);
              setCreating(false);
            }}
            aria-expanded={searching}
          >
            {searching ? "Back to module" : "Search all modules"}
          </button>
          <button
            type="button"
            className={`${secondaryClass} lg:min-h-8 lg:py-1`}
            disabled={busy}
            onClick={() => {
              setCreating((value) => !value);
              setSearching(false);
            }}
            aria-expanded={creating}
          >
            Add module
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-radius-md bg-primary-500/5 p-3 text-sm text-text-secondary"
        >
          {message}
        </p>
      )}
      {creating && (
        <MapForm
          creating
          busy={busy}
          onSave={create}
          onCancel={() => setCreating(false)}
        />
      )}
      {searching && (
        <StudySearch
          onOpenMap={(mapId, noteId) => {
            updateLocation({ map: mapId, note: noteId, ...clearedFilters });
            setMapId(mapId);
            setNoteId(noteId);
            setNoteRequest((value) => value + 1);
            setSearching(false);
          }}
        />
      )}
      <div hidden={creating || searching}>
        {mapId ? (
          <ModuleWorkspace
            key={mapId}
            mapId={mapId}
            initialNoteId={noteId}
            noteRequest={noteRequest}
            tabPreference={tabPreference}
            maps={maps}
            scope={scope}
            onScopeChange={(next) => {
              setScope(next);
              updateLocation({ scope: next === "all" ? "all" : null });
            }}
            onOpenModule={(target, note) => {
              updateLocation({
                map: target,
                note: note ?? null,
                ...clearedFilters,
              });
              setMapId(target);
              setNoteId(note ?? null);
              if (note) setNoteRequest((value) => value + 1);
            }}
            onRefreshMaps={refreshMaps}
            onDeleted={deleted}
            onBusyChange={setBusy}
          />
        ) : settingUp ? (
          <p
            role="status"
            className="rounded-radius-xl border border-border-subtle bg-surface p-6 text-sm text-text-secondary"
          >
            Setting up your modules...
          </p>
        ) : (
          !creating && (
            <section className="rounded-radius-xl border border-border-subtle bg-surface p-6">
              <h2 className="text-lg font-semibold">No modules yet</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Import a course from Canvas and its module map appears here on
                its own, laid out by week and sorted into topics.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/settings#canvas" className={primaryClass}>
                  Connect Canvas
                </Link>
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => setCreating(true)}
                >
                  Add a module from a folder
                </button>
              </div>
            </section>
          )
        )}
      </div>
    </main>
  );
}
