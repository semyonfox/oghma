
import { useState, type FormEvent } from "react";

import { messageFor } from "./study-client";
import {
  mapCreateSchema,
  topicSchema,
  type StudyMap,
  type StudyMapSnapshot,
  type StudyTopic,
} from "@/lib/study-map/types";

import {
  type MapFields,
  fieldClass,
  buttonClass,
  secondaryClass,
  primaryClass,
  errorClass,
  defaultFields,
  useLibrarySearch,
} from "./study-workspace-shared";

// creating a module map, adding materials and writing a topic by hand

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
                  className={`${buttonClass} w-full justify-start break-words text-left ${value === note.id ? "atlas-raised font-medium" : "hover:bg-subtle"}`}
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

export function MapForm({
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
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      {creating && (
        <p className="text-sm text-text-secondary">
          Imported Canvas courses get a module automatically. For anything else,
          name it and pick the folder its notes live in. The syllabus and topics
          are found for you.
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="space-y-4">
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
              className="mt-1 h-4 w-4 accent-accent"
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

export function AddMaterials({
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
    <section aria-label="Add notes and files" className="space-y-3">
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
      <ul className="divide-y divide-border-subtle">
        {notes
          .filter((note) => !note.isFolder)
          .map((note) => (
            <li key={note.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-accent"
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

export function ManualTopic({
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
