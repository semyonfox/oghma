import { z } from "zod";
import useNoteStore from "@/lib/notes/state/note";
import {
  confirmedChoices,
  normaliseMain,
  type TopicChoices,
} from "@/lib/notes/tree-topics";
import {
  materialOverridesSchema,
  settleAssociations,
  topicAssociationSchema,
  type MaterialOverrides,
  type Relevance,
} from "@/lib/study-map/types";

// the per-note view of study maps served by GET /api/study-maps?noteId=
const linkedMapSchema = z.object({
  mapId: z.uuid(),
  mapName: z.string(),
  material: z.object({
    noteId: z.uuid(),
    associations: z.array(topicAssociationSchema).transform(settleAssociations),
    overrides: materialOverridesSchema,
    status: z.enum(["unclassified", "classified", "stale", "failed"]),
    sourceHash: z.string(),
    currentHash: z.string(),
    taxonomyVersion: z.number().int().nonnegative(),
    taxonomyEvidenceStale: z.boolean().optional(),
  }),
  topics: z.array(z.object({ id: z.uuid(), name: z.string() })),
  taxonomyVersion: z.number().int().positive(),
});
export type LinkedMap = z.infer<typeof linkedMapSchema>;

export async function readLinkedMaps(noteId: string, signal?: AbortSignal): Promise<LinkedMap[]> {
  const response = await fetch(`/api/study-maps?noteId=${encodeURIComponent(noteId)}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Study maps unavailable");
  return z.array(linkedMapSchema).parse(await response.json());
}

/** one file's topics in one map, as the popover edits them */
export interface TopicEdit {
  mapId: string;
  mapName: string;
  topics: Array<{ id: string; name: string }>;
  taxonomyVersion: number;
  materialId: string;
  sourceHash: string;
  choices: TopicChoices;
  /** the saved corrections still match this source and topic list */
  correctionsCurrent: boolean;
  kind: MaterialOverrides["kind"];
  labels: MaterialOverrides["labels"];
  /** waiting for review: classifier suggestions and corrections made against an older source */
  suggestions: Record<string, Relevance>;
}

export function topicEditFor(entry: LinkedMap): TopicEdit {
  const { material, taxonomyVersion } = entry;
  const evidenceCurrent = !material.taxonomyEvidenceStale;
  const correctionsCurrent =
    material.overrides.sourceHash === material.currentHash &&
    material.overrides.taxonomyVersion === taxonomyVersion &&
    evidenceCurrent;
  const classificationCurrent =
    material.status === "classified" &&
    material.sourceHash === material.currentHash &&
    material.taxonomyVersion === taxonomyVersion &&
    evidenceCurrent;
  const topicIds = new Set(entry.topics.map((topic) => topic.id));
  const associations = material.associations.filter((association) => topicIds.has(association.topicId));
  const choices = normaliseMain(
    confirmedChoices(
      classificationCurrent ? associations : [],
      Object.fromEntries(
        Object.entries(material.overrides.topics).filter(([id]) => topicIds.has(id)),
      ),
      correctionsCurrent,
    ),
    entry.topics.map((topic) => topic.id),
  );
  const suggestions: Record<string, Relevance> = {};
  for (const association of associations) {
    if (association.status === "rejected") continue;
    if (association.status === "suggested" || !classificationCurrent) {
      suggestions[association.topicId] = association.relevance;
    }
  }
  if (!correctionsCurrent) {
    for (const [id, choice] of Object.entries(material.overrides.topics)) {
      if (topicIds.has(id) && choice !== "excluded") suggestions[id] = choice;
    }
  }
  for (const [id, relevance] of Object.entries(material.overrides.unreviewed ?? {})) {
    if (topicIds.has(id)) suggestions[id] = relevance;
  }
  for (const id of Object.keys(choices)) delete suggestions[id];
  return {
    mapId: entry.mapId,
    mapName: entry.mapName,
    topics: entry.topics,
    taxonomyVersion,
    materialId: material.noteId,
    sourceHash: material.currentHash,
    choices,
    correctionsCurrent,
    kind: material.overrides.kind,
    labels: material.overrides.labels,
    suggestions,
  };
}

/** write through the same manual override path the study map inspector uses */
export async function saveTopicChoices(
  edit: TopicEdit,
  choices: TopicChoices,
  keep: Pick<MaterialOverrides, "kind" | "labels"> = {},
): Promise<void> {
  const response = await fetch(`/api/study-maps/${encodeURIComponent(edit.mapId)}/materials`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      noteId: edit.materialId,
      sourceHash: edit.sourceHash,
      taxonomyVersion: edit.taxonomyVersion,
      topics: normaliseMain(choices, edit.topics.map((topic) => topic.id)),
      ...keep,
    }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = z.object({ error: z.string() }).safeParse(body);
    throw new Error(message.success ? message.data.error : "Topics could not be saved");
  }
}

/**
 * A #tag is a line in the note, so writing one changes the text the study map
 * hashed and its saved topic picks would go stale. Picks that were current
 * before the write are saved again against the new text.
 */
export async function rebaseTopicChoices(before: readonly LinkedMap[], noteId: string): Promise<void> {
  const current = before.map(topicEditFor).filter((edit) => edit.correctionsCurrent);
  if (current.length === 0) return;
  const after = await readLinkedMaps(noteId);
  for (const previous of current) {
    const entry = after.find((candidate) => candidate.mapId === previous.mapId);
    if (!entry) continue;
    const fresh = topicEditFor(entry);
    if (fresh.correctionsCurrent) continue;
    await saveTopicChoices(fresh, previous.choices, { kind: previous.kind, labels: previous.labels });
  }
}

// #tags are lines in the note, written the way the note inspector writes them

export function addTagLine(content: string, tag: string): string {
  const line = `#${tag}`;
  return content ? `${content.trimEnd()}\n${line}\n` : `${line}\n`;
}

export function removeTagLine(content: string, tag: string): string {
  return content
    .split("\n")
    .filter((line) => line.trim() !== `#${tag}`)
    .join("\n");
}

/** strip a leading # and spaces the way the inspector's tag field does */
export function normaliseTagInput(value: string): string {
  return value.replace(/^#/, "").replace(/\s/g, "-");
}

export async function readNoteContent(noteId: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Note unavailable");
  const body = z.object({ content: z.string().nullable().optional() }).parse(await response.json());
  return body.content ?? "";
}

export async function writeNoteContent(noteId: string, content: string, sourceId: string): Promise<void> {
  await useNoteStore.getState().mutateNote(noteId, { content });
  // clean editors showing this note adopt the new content
  window.dispatchEvent(
    new CustomEvent("note-content-sync", { detail: { fileId: noteId, content, sourceId } }),
  );
}

export const tagNamesSchema = z.object({
  tags: z.array(z.object({ tag: z.string(), count: z.number().int().nonnegative() })),
});
