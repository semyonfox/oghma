"use client";

import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";
import {
  documentKinds,
  documentKindSchema,
  materialUpdateSchema,
  topicSchema,
  type DocumentKind,
  type MaterialOverrides,
  type SourceAnchor,
  type StudyMapSnapshot,
  type StudyMaterial,
  type StudyTopic,
} from "@/lib/study-map/types";

export interface StudyInspectorProps {
  snapshot: StudyMapSnapshot;
  selection: { kind: "note" | "topic"; id: string };
  onClose: () => void;
  onReviewMaterial: (input: z.infer<typeof materialUpdateSchema>) => Promise<void>;
  onSaveTopics: (topics: StudyTopic[]) => Promise<void>;
  onRemoveMaterial: (noteId: string) => Promise<void>;
  onClassify: (noteId: string) => Promise<void>;
}

const fieldClass =
  "w-full min-w-0 rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50 md:text-sm";
const buttonClass =
  "min-h-11 rounded-radius-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = `${buttonClass} bg-primary-500/5 text-text hover:bg-primary-500/10`;
const primaryClass = `${buttonClass} bg-primary-600 text-text-on-primary hover:bg-primary-700`;
const dangerClass = `${buttonClass} text-error-700 hover:bg-error-500/10 dark:text-error-300`;
const linkClass =
  "break-words text-sm text-primary-700 underline decoration-primary-500/40 underline-offset-4 hover:decoration-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-300";

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "This change could not be saved. Try again.";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-text">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Evidence({ anchors, snapshot }: { anchors: SourceAnchor[]; snapshot: StudyMapSnapshot }) {
  if (!anchors.length) return <p className="text-sm text-text-tertiary">No quoted source evidence.</p>;
  return (
    <ul className="space-y-3">
      {anchors.map((anchor, index) => {
        const source = snapshot.materials.find((material) => material.noteId === anchor.noteId);
        const reference = snapshot.materials.flatMap((material) => material.references)
          .find((entry) => entry.id === anchor.noteId);
        return (
          <li key={`${anchor.noteId}:${anchor.start}:${anchor.end}:${index}`} className="space-y-1.5 border-l-2 border-border-subtle pl-3">
            <blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{anchor.quote}</blockquote>
            <p className="text-xs text-text-tertiary">
              {anchor.page !== null ? `Page ${anchor.page} · ` : ""}Line {anchor.line}
              {anchor.field === "extracted_text" ? " · extracted text" : ""}
            </p>
            <Link href={`/notes/${anchor.noteId}`} className={linkClass}>
              {source?.title || reference?.title || "Open source note"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function InspectorHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
      <div className="min-w-0">
        <p className="mb-1 text-xs text-text-tertiary">{subtitle}</p>
        <h2 className="break-words text-lg font-semibold text-text">{title}</h2>
      </div>
      <button type="button" className={`${secondaryClass} shrink-0`} onClick={onClose} aria-label="Close inspector">Close</button>
    </header>
  );
}

function NoteInspector({ material, ...props }: StudyInspectorProps & { material: StudyMaterial }) {
  const { snapshot, onClose, onReviewMaterial, onRemoveMaterial, onClassify } = props;
  const [kind, setKind] = useState<DocumentKind>(material.overrides.kind ?? material.kind);
  const [labels, setLabels] = useState((material.overrides.labels ?? material.labels).join(", "));
  const [topics, setTopics] = useState<MaterialOverrides["topics"]>(() => {
    const confirmed = { ...material.overrides.topics };
    for (const association of material.associations) {
      if (association.status === "accepted" && confirmed[association.topicId] === undefined) {
        confirmed[association.topicId] = association.relevance;
      }
    }
    return confirmed;
  });
  const [busy, setBusy] = useState<"save" | "classify" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const topicId = useId();
  const job = snapshot.jobs.find((entry) => entry.kind === "classify" && entry.noteId === material.noteId && (entry.state === "pending" || entry.state === "running"));
  const failedJob = snapshot.jobs.find((entry) => entry.kind === "classify" && entry.noteId === material.noteId && entry.state === "failed");
  const stale = material.status === "stale" || (material.sourceHash !== "" && material.sourceHash !== material.currentHash)
    || (material.classifiedAt !== null && material.taxonomyVersion !== snapshot.map.taxonomyVersion);
  const hasCorrections = material.overrides.kind !== undefined || material.overrides.labels !== undefined || Object.keys(material.overrides.topics).length > 0;
  const staleCorrections = hasCorrections && (material.overrides.sourceHash !== material.currentHash || material.overrides.taxonomyVersion !== snapshot.map.taxonomyVersion || material.taxonomyEvidenceStale);
  const validTopics = new Set(snapshot.map.topics.map((topic) => topic.id));

  async function perform(action: "save" | "classify" | "remove", operation: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await operation();
      if (action === "remove") onClose();
      else setMessage(action === "save" ? "Corrections saved." : "Classification requested. Your saved corrections are kept.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = materialUpdateSchema.safeParse({
      noteId: material.noteId,
      sourceHash: material.currentHash,
      taxonomyVersion: snapshot.map.taxonomyVersion,
      kind,
      labels: splitList(labels),
      topics: Object.fromEntries(Object.entries(topics).filter(([id]) => validTopics.has(id))),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the document details before saving.");
      return;
    }
    void perform("save", () => onReviewMaterial(result.data));
  }

  return (
    <div className="space-y-5 text-text" aria-busy={busy !== null}>
      <InspectorHeader title={material.title || "Untitled note"} subtitle={material.isFile ? "File in study map" : "Note in study map"} onClose={onClose} />
      <Link href={`/notes/${material.noteId}`} className={linkClass}>Open original in editor</Link>
      <div className="space-y-2 rounded-radius-lg bg-primary-500/5 p-3 text-sm text-text-secondary">
        <p className="font-medium text-text">
          {hasCorrections && !staleCorrections ? "Reviewed by you" : stale ? "Classification needs review" : material.status === "unclassified" ? "Not classified yet" : material.status === "failed" ? "Classification failed" : "Classification available"}
        </p>
        {stale && <p>The source or topic definitions changed. Review the suggestions and quoted passages again.</p>}
        {material.status === "unclassified" && <p>You can classify this material or set its topics yourself.</p>}
        {hasCorrections && <p>{staleCorrections ? "Your previous corrections are shown below. Review and save them for the current source and topics." : "Your saved corrections take priority when classification runs again."}</p>}
        {job && <p role="status">{job.state === "running" ? "Classification is running." : "Classification is queued."}</p>}
        {material.status === "failed" && failedJob?.error && <p role="alert">{failedJob.error}</p>}
      </div>
      {material.excerpt && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Excerpt</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{material.excerpt}</p>
        </section>
      )}
      {material.references.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Related material</h3>
          <ul className="space-y-2">
            {material.references.map((reference) => (
              <li key={reference.id}>
                <Link href={`/notes/${reference.id}`} className={linkClass}>{reference.title || "Untitled note"}</Link>
                <p className="text-xs text-text-tertiary">{reference.kind === "embedded" ? "Embedded note" : reference.kind === "file" ? "Related file" : "Related or extracted note"}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy !== null} className="min-w-0 space-y-4">
          <legend className="mb-3 text-sm font-semibold">Review material</legend>
          <Field label="Document kind">
            <select value={kind} onChange={(event) => {
              const result = documentKindSchema.safeParse(event.target.value);
              if (result.success) setKind(result.data);
            }} className={fieldClass}>
              {documentKinds.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Labels, separated by commas">
            <input value={labels} onChange={(event) => setLabels(event.target.value)} className={fieldClass} placeholder="lecture, revision" />
          </Field>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Topic assignments</h3>
            <p className="text-sm text-text-secondary">Choose each topic separately. Suggestions stay unconfirmed until you select a topic and save.</p>
            {snapshot.map.topics.length === 0 && <p className="text-sm text-text-tertiary">Add topics to the map before assigning this material.</p>}
            {snapshot.map.topics.map((topic) => {
              const association = material.associations.find((entry) => entry.topicId === topic.id);
              const decision = topics[topic.id];
              return (
                <div key={topic.id} className="space-y-2 border-t border-border-subtle pt-3">
                  <label htmlFor={`${topicId}-${topic.id}`} className="block break-words text-sm font-medium">{topic.name}</label>
                  <p className="text-xs text-text-secondary">
                    {decision
                      ? material.overrides.topics[topic.id] === decision && !staleCorrections
                        ? decision === "excluded" ? "Excluded by you" : `Accepted by you: ${decision}`
                        : `Your selection: ${decision}`
                      : "Not reviewed"}
                    {association?.status === "suggested" ? ` · Suggested: ${association.relevance}` : ""}
                    {association?.status === "rejected" ? " · Classification excluded this topic" : ""}
                  </p>
                  <select id={`${topicId}-${topic.id}`} className={fieldClass} value={decision ?? ""} onChange={(event) => {
                    const value = event.target.value;
                    setTopics((current) => {
                      const next = { ...current };
                      if (value === "core" || value === "supporting" || value === "excluded") next[topic.id] = value;
                      else delete next[topic.id];
                      return next;
                    });
                  }}>
                    <option value="">Not reviewed</option>
                    <option value="core">Core</option>
                    <option value="supporting">Supporting</option>
                    <option value="excluded">Excluded</option>
                  </select>
                  {association && association.evidence.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer rounded-radius-md py-1 text-text-secondary focus-visible:outline-2 focus-visible:outline-primary-500">Source evidence</summary>
                      <div className="mt-3"><Evidence anchors={association.evidence.map((entry) => entry.anchor)} snapshot={snapshot} /></div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <button type="submit" className={primaryClass}>{busy === "save" ? "Saving corrections..." : "Save corrections"}</button>
        </fieldset>
      </form>
      <button type="button" className={secondaryClass} disabled={busy !== null || Boolean(job) || !snapshot.provider.ready || snapshot.map.topics.length === 0} onClick={() => void perform("classify", () => onClassify(material.noteId))}>
        {busy === "classify" || job ? "Classification pending..." : material.classifiedAt ? "Reclassify material" : "Classify material"}
      </button>
      {!snapshot.provider.ready && <p className="text-sm text-text-tertiary">Classification is unavailable. You can still save your own topic assignments.</p>}
      {error && <p role="alert" className="break-words text-sm text-error-700 dark:text-error-300">{error}</p>}
      {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
      <section className="space-y-2 border-t border-border-subtle pt-4">
        <p className="text-sm text-text-secondary">Removing this material only removes it from this map. The original note or file stays in your library.</p>
        {confirmRemove ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Remove this material from the map?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={dangerClass} disabled={busy !== null} onClick={() => void perform("remove", () => onRemoveMaterial(material.noteId))}>{busy === "remove" ? "Removing..." : "Confirm removal"}</button>
              <button type="button" className={secondaryClass} disabled={busy !== null} onClick={() => setConfirmRemove(false)}>Cancel</button>
            </div>
          </div>
        ) : <button type="button" className={dangerClass} disabled={busy !== null} onClick={() => setConfirmRemove(true)}>Remove from map</button>}
      </section>
    </div>
  );
}

function TopicInspector({ topic, ...props }: StudyInspectorProps & { topic: StudyTopic }) {
  const { snapshot, onClose, onSaveTopics } = props;
  const [draft, setDraft] = useState(topic);
  const [aliases, setAliases] = useState(topic.aliases.join(", "));
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blockedParents = new Set([topic.id]);
  for (let index = 0; index < snapshot.map.topics.length; index++) {
    for (const entry of snapshot.map.topics) {
      if (entry.parentId && blockedParents.has(entry.parentId)) blockedParents.add(entry.id);
    }
  }
  const childCount = snapshot.map.topics.filter((entry) => entry.parentId === topic.id).length;

  function change(field: "name" | "definition" | "includes" | "excludes", value: string) {
    setDraft((current) => ({ ...current, [field]: value, reviewed: false }));
  }

  async function persist(topics: StudyTopic[], action: "save" | "delete") {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await onSaveTopics(topics);
      if (action === "delete") onClose();
      else setMessage(draft.reviewed ? "Topic saved and approved." : "Topic saved. Approval is pending.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = topicSchema.safeParse({ ...draft, aliases: splitList(aliases) });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the topic details before saving.");
      return;
    }
    if (snapshot.map.topics.some((entry) => entry.id !== topic.id && entry.name.trim().toLocaleLowerCase() === result.data.name.toLocaleLowerCase())) {
      setError("Another topic already has this name. Choose a different name.");
      return;
    }
    void persist(snapshot.map.topics.map((entry) => entry.id === topic.id ? result.data : entry), "save");
  }

  return (
    <div className="space-y-5 text-text" aria-busy={busy !== null}>
      <InspectorHeader title={topic.name} subtitle="Topic definition" onClose={onClose} />
      <div className="space-y-1 rounded-radius-lg bg-primary-500/5 p-3 text-sm text-text-secondary">
        <p className="font-medium text-text">{topic.sources.length ? "Definition from source material" : "Your definition"}</p>
        <p>{topic.reviewed ? "Approved by you." : "Pending review. Read the definition and its sources before approving."}</p>
      </div>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy !== null} className="min-w-0 space-y-4">
          <Field label="Topic name"><input className={fieldClass} value={draft.name} maxLength={100} required onChange={(event) => change("name", event.target.value)} /></Field>
          <Field label="Definition"><textarea className={fieldClass} value={draft.definition} rows={4} maxLength={2000} required onChange={(event) => change("definition", event.target.value)} /></Field>
          <Field label="Includes"><textarea className={fieldClass} value={draft.includes} rows={2} maxLength={1000} onChange={(event) => change("includes", event.target.value)} /></Field>
          <Field label="Excludes"><textarea className={fieldClass} value={draft.excludes} rows={2} maxLength={1000} onChange={(event) => change("excludes", event.target.value)} /></Field>
          <Field label="Aliases, separated by commas"><input className={fieldClass} value={aliases} onChange={(event) => { setAliases(event.target.value); setDraft((current) => ({ ...current, reviewed: false })); }} /></Field>
          <Field label="Parent topic">
            <select className={fieldClass} value={draft.parentId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value || null, reviewed: false }))}>
              <option value="">No parent topic</option>
              {snapshot.map.topics.filter((entry) => !blockedParents.has(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </Field>
          {topic.sources.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Definition sources</h3>
              <Evidence anchors={topic.sources} snapshot={snapshot} />
            </section>
          )}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
            <input type="checkbox" checked={draft.reviewed} onChange={(event) => setDraft((current) => ({ ...current, reviewed: event.target.checked }))} className="mt-1 h-4 w-4 accent-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500" />
            <span><span className="block font-medium">Approve topic</span><span className="text-text-secondary">I have reviewed this definition and its scope. Editing it clears approval.</span></span>
          </label>
          <button type="submit" className={primaryClass}>{busy === "save" ? "Saving topic..." : "Save topic"}</button>
        </fieldset>
      </form>
      {error && <p role="alert" className="break-words text-sm text-error-700 dark:text-error-300">{error}</p>}
      {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
      <section className="space-y-2 border-t border-border-subtle pt-4">
        <p className="text-sm text-text-secondary">Deleting this topic removes it from the map. Your notes stay in your library.{childCount > 0 ? ` Its ${childCount === 1 ? "child topic will" : `${childCount} child topics will`} have no parent.` : ""}</p>
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Delete this topic?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={dangerClass} disabled={busy !== null} onClick={() => void persist(snapshot.map.topics.filter((entry) => entry.id !== topic.id).map((entry) => entry.parentId === topic.id ? { ...entry, parentId: null } : entry), "delete")}>{busy === "delete" ? "Deleting..." : "Confirm deletion"}</button>
              <button type="button" className={secondaryClass} disabled={busy !== null} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        ) : <button type="button" className={dangerClass} disabled={busy !== null} onClick={() => setConfirmDelete(true)}>Delete topic</button>}
      </section>
    </div>
  );
}

export default function StudyInspector(props: StudyInspectorProps) {
  if (props.selection.kind === "note") {
    const material = props.snapshot.materials.find((entry) => entry.noteId === props.selection.id);
    if (material) return <NoteInspector key={`note:${material.noteId}`} {...props} material={material} />;
  } else {
    const topic = props.snapshot.map.topics.find((entry) => entry.id === props.selection.id);
    if (topic) return <TopicInspector key={`topic:${topic.id}`} {...props} topic={topic} />;
  }
  return (
    <div className="space-y-4 text-text">
      <p role="status" className="text-sm text-text-secondary">This item is no longer in the study map.</p>
      <button type="button" className={secondaryClass} onClick={props.onClose}>Close inspector</button>
    </div>
  );
}
