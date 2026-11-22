import Link from "next/link";
import { useEffect, useState } from "react";

import { z } from "zod";

import {
  documentKinds,
  documentKindSchema,
  effectiveAssociations,
  type StudyMapSnapshot,
  type StudyMaterial,
} from "@/lib/study-map/types";

import {
  type Selection,
  updateLocation,
  fieldClass,
  buttonClass,
} from "./study-workspace-shared";

// the materials panel: review state per note and the bulk actions

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
  return material.associations.some(
    (association) => association.status === "suggested",
  )
    ? "suggested"
    : "tagged";
}

const reviewLabels: Record<string, string> = {
  reviewed: "Reviewed by you",
  suggested: "Suggestions to review",
  tagged: "Tagged automatically",
  stale: "Needs fresh review",
  unclassified: "Not classified",
  failed: "Classification failed",
};

export function MaterialList({
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
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block space-y-1 text-sm">
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
      <ul className="grid gap-3">
        {materials.map((material) => {
          const associations = effectiveAssociations(
            material,
            snapshot.map.taxonomyVersion,
          );
          return (
            <li
              key={material.noteId}
              className={`rounded-radius-lg border bg-surface p-4 ${selected?.kind === "note" && selected.id === material.noteId ? "border-border-strong atlas-raised" : "border-border-subtle"}`}
            >
              <button
                type="button"
                className="w-full rounded-radius-md text-left focus-visible:outline-2 focus-visible:outline-accent"
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
                      className={`${buttonClass} border border-border bg-surface text-xs hover:bg-subtle`}
                      onClick={() => onSelect({ kind: "topic", id: entry.id })}
                    >
                      {entry.name}
                      {association.status === "suggested" ? " · suggested" : ""}
                    </button>
                  ) : null;
                })}
                <Link
                  href={`/notes/${material.noteId}`}
                  className={`${buttonClass} text-accent underline underline-offset-4`}
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
