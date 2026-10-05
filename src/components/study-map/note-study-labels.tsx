"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  documentKindSchema,
  materialOverridesSchema,
  topicAssociationSchema,
  topicSchema,
} from "@/lib/study-map/types";

export interface NoteStudyLabelsProps {
  noteId: string;
  compact?: boolean;
}

const materialLabelsSchema = z.object({
  noteId: z.uuid(),
  kind: documentKindSchema,
  labels: z.array(z.string()),
  associations: z.array(topicAssociationSchema),
  overrides: materialOverridesSchema,
  status: z.enum(["unclassified", "classified", "stale", "failed"]),
  sourceHash: z.string(),
  currentHash: z.string(),
  taxonomyVersion: z.number().int().nonnegative(),
  taxonomyEvidenceStale: z.boolean().optional(),
});
const linkedMapSchema = z.object({
  mapId: z.uuid(),
  mapName: z.string(),
  material: materialLabelsSchema,
  topics: z.array(topicSchema),
  taxonomyVersion: z.number().int().positive(),
});
const mapChoiceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  academicYear: z.string(),
});
const linkedMapsSchema = z.union([
  z.array(linkedMapSchema),
  z.object({ maps: z.array(linkedMapSchema) }).transform((value) => value.maps),
]);
const mapChoicesSchema = z.union([
  z.array(mapChoiceSchema),
  z.object({ maps: z.array(mapChoiceSchema) }).transform((value) => value.maps),
]);
type LinkedMap = z.infer<typeof linkedMapSchema>;
type MapChoice = z.infer<typeof mapChoiceSchema>;

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md px-3 py-2 text-sm font-medium text-text hover:bg-primary-500/5 focus-visible:outline-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const linkClass =
  "inline-flex min-h-11 items-center break-words text-sm font-medium text-primary-700 underline decoration-primary-500/30 underline-offset-4 hover:decoration-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-300";

async function readLinkedMaps(
  noteId: string,
  signal: AbortSignal,
): Promise<LinkedMap[]> {
  const response = await fetch(
    `/api/study-maps?noteId=${encodeURIComponent(noteId)}`,
    {
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Study labels unavailable");
  const body: unknown = await response.json();
  return linkedMapsSchema.parse(body);
}

function LinkedLabels({ entry, noteId }: { entry: LinkedMap; noteId: string }) {
  const { material, taxonomyVersion, topics } = entry;
  const correctionsCurrent =
    material.overrides.sourceHash === material.currentHash &&
    material.overrides.taxonomyVersion === taxonomyVersion &&
    !material.taxonomyEvidenceStale;
  const classificationCurrent =
    material.status === "classified" &&
    material.sourceHash !== "" &&
    material.sourceHash === material.currentHash &&
    material.taxonomyVersion === taxonomyVersion &&
    !material.taxonomyEvidenceStale;
  const stale =
    material.status === "stale" ||
    (Boolean(material.sourceHash) && !classificationCurrent);
  const hasCorrections =
    material.overrides.labels !== undefined ||
    material.overrides.kind !== undefined ||
    Object.keys(material.overrides.topics).length > 0;
  const staleCorrections = hasCorrections && !correctionsCurrent;
  const associations = new Map(
    material.associations.map((association) => [
      association.topicId,
      association,
    ]),
  );
  if (correctionsCurrent) {
    for (const [topicId, relevance] of Object.entries(
      material.overrides.topics,
    )) {
      if (relevance === "excluded") associations.delete(topicId);
      else
        associations.set(topicId, {
          topicId,
          relevance,
          status: "accepted",
          origin: "manual",
          probability: null,
          evidence: [],
        });
    }
  }
  const assignments = [...associations.values()].filter(
    (association) =>
      association.status !== "rejected" &&
      topics.some((topic) => topic.id === association.topicId),
  );
  const labels = material.overrides.labels ?? material.labels;
  const labelsStale =
    material.overrides.labels !== undefined
      ? !correctionsCurrent
      : !classificationCurrent;
  const href = `/study-map?map=${encodeURIComponent(entry.mapId)}&note=${encodeURIComponent(material.noteId)}`;

  return (
    <li className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-x-3">
        <Link href={href} className={linkClass}>
          {entry.mapName}
        </Link>
        {material.noteId !== noteId && (
          <span
            className="rounded-radius-sm bg-primary-500/5 px-2 py-1 text-xs text-text-secondary"
            title="Labels from the explicitly linked original file or extracted note"
          >
            Linked source
          </span>
        )}
        <span className="text-xs text-text-tertiary">
          {hasCorrections && correctionsCurrent
            ? "Reviewed by you"
            : stale || staleCorrections
              ? "Needs review"
              : material.status === "unclassified"
                ? "Not classified"
                : material.status === "failed"
                  ? "Classification unavailable"
                  : "Study labels"}
        </span>
      </div>
      {(assignments.length > 0 || labels.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {assignments.map((association) => {
            const topic = topics.find(
              (candidate) => candidate.id === association.topicId,
            );
            const assignmentStale =
              association.origin === "manual" && correctionsCurrent
                ? false
                : !classificationCurrent;
            const status = assignmentStale
              ? "Stale"
              : association.status === "accepted"
                ? "Accepted"
                : "Suggested";
            return (
              <Link
                key={association.topicId}
                href={href}
                aria-label={`${topic?.name}, ${association.relevance}, ${status.toLowerCase()}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-radius-md bg-primary-500/5 px-2.5 py-2 text-xs text-text-secondary hover:bg-primary-500/10 focus-visible:outline-2 focus-visible:outline-primary-500"
              >
                <span className="break-words font-medium text-text">
                  {topic?.name}
                </span>
                <span>
                  {association.relevance} · {status.toLowerCase()}
                </span>
              </Link>
            );
          })}
          {labels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="inline-flex min-h-11 items-center rounded-radius-md border border-border-subtle px-2.5 py-2 text-xs text-text-secondary"
            >
              {label}
              {labelsStale
                ? " · stale label"
                : material.overrides.labels !== undefined
                  ? " · your label"
                  : " · suggested label"}
            </span>
          ))}
        </div>
      )}
      {assignments.length === 0 && labels.length === 0 && (
        <p className="text-xs text-text-tertiary">
          No topic assignments yet. Review this note in the map.
        </p>
      )}
      {staleCorrections && (
        <p className="text-xs text-text-tertiary">
          Saved corrections need review against the current source and topics.
        </p>
      )}
      {stale && correctionsCurrent && hasCorrections && (
        <p className="text-xs text-text-tertiary">
          Your corrections are current. Automatic suggestions still need review.
        </p>
      )}
    </li>
  );
}

function LabelsForNote({ noteId, compact = false }: NoteStudyLabelsProps) {
  const pickerId = useId();
  const addRequest = useRef<AbortController | null>(null);
  const [linkedMaps, setLinkedMaps] = useState<LinkedMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choices, setChoices] = useState<MapChoice[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [choicesError, setChoicesError] = useState(false);
  const [choiceReload, setChoiceReload] = useState(0);
  const [selectedMap, setSelectedMap] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const request = new AbortController();
    void readLinkedMaps(noteId, request.signal)
      .then((maps) => {
        if (!request.signal.aborted) {
          setLinkedMaps(maps);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [noteId, reload]);

  useEffect(() => {
    if (!pickerOpen) return;
    const request = new AbortController();
    void fetch("/api/study-maps", { signal: request.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Map list unavailable");
        const body: unknown = await response.json();
        const maps = mapChoicesSchema.parse(body);
        if (!request.signal.aborted) {
          setChoices(maps);
          setChoicesError(false);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) setChoicesError(true);
      })
      .finally(() => {
        if (!request.signal.aborted) setChoicesLoading(false);
      });
    return () => request.abort();
  }, [pickerOpen, choiceReload]);

  useEffect(() => () => addRequest.current?.abort(), []);

  const availableMaps = choices.filter(
    (choice) => !linkedMaps.some((entry) => entry.mapId === choice.id),
  );
  const selected = availableMaps.some((choice) => choice.id === selectedMap)
    ? selectedMap
    : (availableMaps[0]?.id ?? "");

  function togglePicker() {
    if (!pickerOpen) {
      setChoicesLoading(true);
      setChoicesError(false);
      setAddError(null);
    }
    setPickerOpen(!pickerOpen);
  }

  async function addToMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selected ||
      adding ||
      !availableMaps.some((choice) => choice.id === selected)
    )
      return;
    addRequest.current?.abort();
    const request = new AbortController();
    addRequest.current = request;
    setAdding(true);
    setAddError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/study-maps/${encodeURIComponent(selected)}/materials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteIds: [noteId] }),
          signal: request.signal,
        },
      );
      if (!response.ok) {
        setAddError(
          "This note could not be added. Check that the note and map are still available, then try again.",
        );
        return;
      }
      const maps = await readLinkedMaps(noteId, request.signal);
      if (!request.signal.aborted) {
        setLinkedMaps(maps);
        setLoadError(false);
        setPickerOpen(false);
        setMessage(
          "Added to the study map. Topic assignments are available after classification or manual review.",
        );
      }
    } catch {
      if (!request.signal.aborted)
        setAddError(
          "The change could not be confirmed. Reload study labels before trying again.",
        );
    } finally {
      if (!request.signal.aborted) setAdding(false);
    }
  }

  return (
    <section
      aria-label="Note study labels"
      className={`${compact ? "py-1" : "rounded-radius-lg border border-border-subtle px-3 py-2"} min-w-0 text-text`}
      aria-busy={loading || adding}
    >
      {loading ? (
        <p role="status" className="py-2 text-xs text-text-tertiary">
          Loading study labels...
        </p>
      ) : loadError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-text-secondary">
            Study labels could not be loaded.
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setLoading(true);
              setReload((current) => current + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {linkedMaps.length > 0 && (
            <ul className="space-y-2">
              {linkedMaps.map((entry) => (
                <LinkedLabels
                  key={`${entry.mapId}:${entry.material.noteId}`}
                  entry={entry}
                  noteId={noteId}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            className={`${buttonClass} ${compact ? "px-0" : "-ml-1"}`}
            aria-expanded={pickerOpen}
            aria-controls={pickerId}
            disabled={adding}
            onClick={togglePicker}
          >
            {pickerOpen
              ? "Close map picker"
              : linkedMaps.length
                ? "Add to another study map"
                : "Add to study map"}
          </button>
        </>
      )}
      {pickerOpen && (
        <div
          id={pickerId}
          className="space-y-2 border-t border-border-subtle py-3"
        >
          {choicesLoading ? (
            <p role="status" className="text-sm text-text-tertiary">
              Loading your study maps...
            </p>
          ) : choicesError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm text-text-secondary">
                Your study maps could not be loaded.
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setChoicesLoading(true);
                  setChoiceReload((current) => current + 1);
                }}
              >
                Retry
              </button>
            </div>
          ) : availableMaps.length > 0 ? (
            <form
              onSubmit={(event) => void addToMap(event)}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="min-w-40 flex-1 space-y-1 text-sm text-text-secondary">
                Choose a study map
                <select
                  value={selected}
                  disabled={adding}
                  onChange={(event) => setSelectedMap(event.target.value)}
                  className="min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text focus-visible:outline-2 focus-visible:outline-primary-500 sm:text-sm"
                >
                  {availableMaps.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.name} · {choice.academicYear}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={adding}
                className={`${buttonClass} bg-primary-600 text-text-on-primary hover:bg-primary-700`}
              >
                {adding ? "Adding..." : "Add note"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-text-secondary">
              {choices.length === 0
                ? "Create a study map for this module, then add the note."
                : "This note is already linked to all your study maps."}
            </p>
          )}
          {!choicesLoading && !choicesError && (
            <Link
              className={linkClass}
              href={`/study-map?note=${encodeURIComponent(noteId)}`}
            >
              Create a study map
            </Link>
          )}
          {addError && (
            <div className="flex flex-wrap items-center gap-2">
              <p
                role="alert"
                className="text-sm text-error-700 dark:text-error-300"
              >
                {addError}
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setLoading(true);
                  setPickerOpen(false);
                  setReload((current) => current + 1);
                }}
              >
                Reload study labels
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="py-1 text-xs text-text-secondary">
          {message}
        </p>
      )}
    </section>
  );
}

export default function NoteStudyLabels(props: NoteStudyLabelsProps) {
  return <LabelsForNote key={props.noteId} {...props} />;
}
