import { z } from "zod";
import sql from "@/database/pgsql";
import { extractTags, inferFileType } from "@/lib/notes/utils/file-spec";
import { summariseMaterialTopics, type TopicName } from "@/lib/notes/tree-topics";
import type { TagsViewData, TagsViewFile, TagsViewReview, TagsViewTopic } from "@/lib/notes/tags-view";
import {
  documentKindSchema,
  materialOverridesSchema,
  topicAssociationSchema,
} from "@/lib/study-map/types";

export interface ScopeNoteRow {
  note_id: string;
  parent_id: string | null;
  root_id: string;
  title: string | null;
  is_folder: boolean;
  s3_key: string | null;
  mime_type: string | null;
  extracted_from_note_id: string | null;
  /** only selected when it could hold a tag, so large notes without one stay in the database */
  tag_content: string | null;
}

export interface ScopeMapRow {
  id: string;
  name: string;
  root_id: string;
  topics: unknown;
  taxonomy_version: number;
}

export interface ScopeMaterialRow {
  map_id: string;
  note_id: string;
  associations: unknown;
  overrides: unknown;
  taxonomy_version: number;
  kind: string;
}

const MAX_SCOPE_NOTES = 5_000;
const topicNamesSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const associationsSchema = z.array(topicAssociationSchema);

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byTitle = (left: TagsViewFile, right: TagsViewFile) =>
  titleCollator.compare(left.title, right.title) || left.id.localeCompare(right.id);

function stripExtension(title: string): string {
  return title.replace(/\.[a-z0-9]{1,8}$/i, "");
}

interface Document {
  file: TagsViewFile;
  rootId: string;
  memberIds: string[];
  tagContent: string | null;
}

/** pair each PDF with its extracted note and give every document its folder path */
function documentsFor(rows: readonly ScopeNoteRow[]): Document[] {
  const byId = new Map(rows.map((row) => [row.note_id, row]));
  const files = rows.filter((row) => !row.is_folder);
  const isBinary = (row: ScopeNoteRow) =>
    Boolean(row.s3_key) && inferFileType(row.title, row.mime_type, row.s3_key) !== "note";
  const pairedNote = new Map<string, ScopeNoteRow>();
  for (const row of files) {
    const source = row.extracted_from_note_id ? byId.get(row.extracted_from_note_id) : undefined;
    if (source && !source.is_folder && isBinary(source) && !isBinary(row) && !pairedNote.has(source.note_id)) {
      pairedNote.set(source.note_id, row);
    }
  }
  const absorbed = new Set([...pairedNote.values()].map((row) => row.note_id));

  const pathOf = (row: ScopeNoteRow, displayTitle: string) => {
    const parts: string[] = [];
    let parentId = row.parent_id;
    for (let depth = 0; parentId && depth < 50; depth += 1) {
      const parent = byId.get(parentId);
      if (!parent || parent.note_id === row.root_id) break;
      // extraction puts a PDF in a folder named after it, which says nothing
      if (!(parts.length === 0 && parent.title === displayTitle)) parts.unshift(parent.title ?? "");
      parentId = parent.parent_id;
    }
    return parts.filter(Boolean).join(" / ");
  };

  return files.flatMap((row) => {
    if (absorbed.has(row.note_id)) return [];
    const note = pairedNote.get(row.note_id);
    const binary = isBinary(row);
    const rawTitle = row.title ?? "";
    const title = binary ? stripExtension(rawTitle) : rawTitle.replace(/\.md$/i, "");
    return [{
      rootId: row.root_id,
      memberIds: note ? [row.note_id, note.note_id] : [row.note_id],
      tagContent: (note ?? (binary ? null : row))?.tag_content ?? null,
      file: {
        id: row.note_id,
        noteId: note ? note.note_id : binary ? null : row.note_id,
        title,
        path: pathOf(row, title),
        rootId: row.root_id,
        isFile: binary,
        mimeType: row.mime_type,
        main: false,
        suggested: false,
        kind: null,
      },
    }];
  });
}

/**
 * Group a scope's documents by the user's #tags and by study-map topic. The
 * #tag counts only include documents in this scope. Anything with no topic
 * at all, suggested or confirmed, lands in "Not tagged yet".
 */
export function buildTagsView(input: {
  roots: ReadonlyArray<{ id: string; title: string }>;
  notes: readonly ScopeNoteRow[];
  maps: readonly ScopeMapRow[];
  materials: readonly ScopeMaterialRow[];
}): TagsViewData {
  const documents = documentsFor(input.notes);
  const documentByMember = new Map<string, Document>();
  for (const document of documents) {
    for (const id of document.memberIds) documentByMember.set(id, document);
  }

  const tags = new Map<string, TagsViewFile[]>();
  for (const document of documents) {
    for (const tag of extractTags(document.tagContent)) {
      tags.set(tag, [...(tags.get(tag) ?? []), document.file]);
    }
  }

  const mapsById = new Map<string, { row: ScopeMapRow; topics: TopicName[] }>();
  for (const row of input.maps) {
    const topics = topicNamesSchema.safeParse(row.topics);
    if (topics.success) mapsById.set(row.id, { row, topics: topics.data });
  }

  const topicFiles = new Map<string, Map<string, TagsViewFile>>();
  const tagged = new Set<Document>();
  // topic key and file id for suggestions that are stale corrections, shown as "changed"
  const changed = new Set<string>();
  for (const material of input.materials) {
    const map = mapsById.get(material.map_id);
    const document = documentByMember.get(material.note_id);
    const associations = associationsSchema.safeParse(material.associations);
    const overrides = materialOverridesSchema.safeParse(material.overrides);
    if (!map || !document || !associations.success || !overrides.success) continue;
    const parsedKind = documentKindSchema.safeParse(material.kind);
    const kind = overrides.data.kind ?? (parsedKind.success ? parsedKind.data : "other");
    const correctionsStale = overrides.data.taxonomyVersion !== map.row.taxonomy_version;
    const marks = summariseMaterialTopics({
      mapId: map.row.id,
      topics: map.topics,
      mapTaxonomyVersion: map.row.taxonomy_version,
      materialTaxonomyVersion: material.taxonomy_version,
      associations: associations.data,
      overrides: overrides.data,
    });
    for (const mark of marks) {
      const key = `${mark.mapId}:${mark.topicId}`;
      const files = topicFiles.get(key) ?? new Map<string, TagsViewFile>();
      // a pair can be two materials in one map, so keep the stronger reading
      const previous = files.get(document.file.id);
      files.set(document.file.id, {
        ...document.file,
        main: mark.main || (previous?.main ?? false),
        suggested: mark.suggested && (previous?.suggested ?? true),
        kind: previous?.kind && previous.kind !== "other" ? previous.kind : kind,
      });
      topicFiles.set(key, files);
      tagged.add(document);
      const pick = overrides.data.topics[mark.topicId];
      if (
        mark.suggested &&
        ((correctionsStale && (pick === "core" || pick === "supporting")) ||
          overrides.data.unreviewed?.[mark.topicId] !== undefined)
      ) {
        changed.add(`${key}|${document.file.id}`);
      }
    }
  }

  return {
    tags: [...tags]
      .map(([tag, files]) => ({ tag, files: [...files].sort(byTitle) }))
      .sort((left, right) => right.files.length - left.files.length || left.tag.localeCompare(right.tag)),
    courses: input.roots.map((root) => {
      const maps = [...mapsById.values()].filter((map) => map.row.root_id === root.id);
      const topics: TagsViewTopic[] = maps.flatMap((map) =>
        map.topics.flatMap((topic, topicIndex) => {
          const files = topicFiles.get(`${map.row.id}:${topic.id}`);
          if (!files?.size) return [];
          return [{
            mapId: map.row.id,
            topicId: topic.id,
            name: topic.name,
            topicIndex,
            files: [...files.values()].sort(byTitle),
          }];
        }),
      );
      const review = new Map<string, TagsViewReview>();
      for (const topic of topics) {
        for (const file of topic.files) {
          if (!file.suggested) continue;
          const key = `${topic.mapId}:${topic.topicId}`;
          const entry = review.get(file.id) ?? { ...file, changed: false, topics: [] };
          entry.changed ||= changed.has(`${key}|${file.id}`);
          entry.topics.push({ mapId: topic.mapId, topicId: topic.topicId, name: topic.name, topicIndex: topic.topicIndex });
          review.set(file.id, entry);
        }
      }
      return {
        rootId: root.id,
        title: root.title,
        maps: maps.map((map) => ({ id: map.row.id, name: map.row.name })),
        topics,
        review: [...review.values()].sort(byTitle),
        untagged: documents
          .filter((document) => document.rootId === root.id && !tagged.has(document))
          .map((document) => document.file)
          .sort(byTitle),
      };
    }),
  };
}

export async function readTagsView(userId: string, rootIds: readonly string[]): Promise<TagsViewData> {
  const ids = [...new Set(rootIds)];
  const roots = await sql<Array<{ id: string; title: string | null; canvas_course_id: string | null }>>`
    SELECT n.note_id AS id, n.title, n.canvas_course_id::text AS canvas_course_id
    FROM app.notes n
    JOIN app.tree_items tree ON tree.note_id = n.note_id AND tree.user_id = n.user_id
    WHERE n.user_id = ${userId}::uuid AND n.note_id = ANY(${ids}::uuid[])
      AND n.is_folder AND n.deleted_at IS NULL AND tree.parent_id IS NULL
  `;
  if (roots.length === 0) return { tags: [], courses: [] };
  const rootIdList = roots.map((root) => root.id);
  const courseIds = roots.flatMap((root) => (root.canvas_course_id ? [root.canvas_course_id] : []));

  const [notes, maps] = await Promise.all([
    sql<ScopeNoteRow[]>`
      WITH RECURSIVE scope AS (
        SELECT tree.note_id, tree.parent_id, tree.note_id AS root_id, 0 AS depth
        FROM app.tree_items tree
        WHERE tree.user_id = ${userId}::uuid AND tree.note_id = ANY(${rootIdList}::uuid[])
        UNION ALL
        SELECT child.note_id, child.parent_id, scope.root_id, scope.depth + 1
        FROM app.tree_items child
        JOIN scope ON child.parent_id = scope.note_id
        WHERE child.user_id = ${userId}::uuid AND scope.depth < 50
      )
      SELECT scope.note_id, scope.parent_id, scope.root_id, n.title, n.is_folder, n.s3_key,
        n.extracted_from_note_id,
        (SELECT a.mime_type FROM app.attachments a
         WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
         ORDER BY a.id LIMIT 1) AS mime_type,
        CASE WHEN NOT n.is_folder
          AND (n.content ~ '(^|[[:space:]])#[A-Za-z0-9]' OR n.content LIKE '---%')
          THEN n.content END AS tag_content
      FROM scope
      JOIN app.notes n ON n.note_id = scope.note_id AND n.user_id = ${userId}::uuid
      WHERE n.deleted_at IS NULL AND n.is_import_cache_source = FALSE
      LIMIT ${MAX_SCOPE_NOTES}
    `,
    // a map belongs to a course by its root folder or by the canvas course it was made for
    sql<ScopeMapRow[]>`
      SELECT map.id, map.name, map.taxonomy_version,
        COALESCE(
          (SELECT root.note_id FROM app.notes root
           WHERE root.note_id = ANY(${rootIdList}::uuid[]) AND root.user_id = map.user_id
             AND (root.note_id = map.root_note_id OR root.canvas_course_id::text = map.canvas_course_id)
           ORDER BY (root.note_id = map.root_note_id) DESC LIMIT 1),
          map.root_note_id
        ) AS root_id,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', topic.value->>'id', 'name', topic.value->>'name')
             ORDER BY topic.ordinality)
           FROM jsonb_array_elements(map.topics) WITH ORDINALITY AS topic(value, ordinality)),
          '[]'::jsonb
        ) AS topics
      FROM app.study_maps map
      WHERE map.user_id = ${userId}::uuid
        AND (map.root_note_id = ANY(${rootIdList}::uuid[]) OR map.canvas_course_id = ANY(${courseIds}::text[]))
      ORDER BY map.updated_at DESC, map.id
    `,
  ]);

  const materials = maps.length
    ? await sql<ScopeMaterialRow[]>`
        SELECT material.map_id, material.note_id, material.associations, material.overrides,
          material.taxonomy_version, material.kind
        FROM app.study_materials material
        WHERE material.user_id = ${userId}::uuid
          AND material.map_id = ANY(${maps.map((map) => map.id)}::uuid[])
          AND NOT material.excluded
      `
    : [];

  return buildTagsView({
    roots: roots.map((root) => ({ id: root.id, title: root.title ?? "" })),
    notes,
    maps,
    materials,
  });
}

const MAX_TAGGED_NOTES = 2_000;

/** every #tag the user has, with how many notes use it, for autocomplete */
export async function readTagNames(userId: string): Promise<Array<{ tag: string; count: number }>> {
  const rows = await sql<Array<{ content: string }>>`
    SELECT n.content
    FROM app.notes n
    WHERE n.user_id = ${userId}::uuid AND n.deleted_at IS NULL AND NOT n.is_folder
      AND NOT n.is_import_cache_source
      AND (n.content ~ '(^|[[:space:]])#[A-Za-z0-9]' OR n.content LIKE '---%')
    ORDER BY n.updated_at DESC
    LIMIT ${MAX_TAGGED_NOTES}
  `;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of extractTags(row.content)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}
