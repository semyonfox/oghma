import { z } from "zod";
import sql from "@/database/pgsql";
import { ApiError } from "@/lib/api-errors";
import {
  documentKindSchema,
  materialOverridesSchema,
  topicAssociationSchema,
  topicSchema,
  type DocumentKind,
  type MaterialReference,
  type Relevance,
  type TopicAssociation,
} from "./types";

export const studySearchFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    mapId: z.uuid().optional(),
    topicId: z.uuid().optional(),
    kind: documentKindSchema.optional(),
    label: z.string().trim().min(1).max(64).optional(),
    sort: z
      .enum(["relevance", "title", "updated", "topics"])
      .default("relevance"),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(50_000).default(0),
  })
  .strict();
export type StudySearchFilters = z.input<typeof studySearchFiltersSchema>;

interface StudySearchResult {
  noteId: string;
  title: string;
  mapId: string;
  mapName: string;
  kind: DocumentKind;
  labels: string[];
  topics: Array<{
    id: string;
    name: string;
    relevance: Relevance;
    status: "suggested" | "accepted";
  }>;
  updatedAt: string;
  stale: boolean;
  sourceNoteId: string;
  references: MaterialReference[];
}

export interface StudySearchResponse {
  results: StudySearchResult[];
  total: number;
  limit: number;
  nextOffset: number | null;
  availableFacets: {
    maps: Array<{ id: string; name: string; count: number }>;
    topics: Array<{ id: string; name: string; mapId: string; count: number }>;
    kinds: Array<{ kind: DocumentKind; count: number }>;
    labels: Array<{ label: string; count: number }>;
  };
}

interface SearchMapRow {
  id: string;
  name: string;
  topics: unknown;
  taxonomy_version: number;
  material_count: number;
  current_topic_ids: string[];
}

interface SearchMaterialRow {
  note_id: string;
  map_id: string;
  title: string | null;
  kind: unknown;
  labels: unknown;
  associations: unknown;
  overrides: unknown;
  source_hash: string;
  current_hash: string;
  source_note_id: string;
  source_field: "content" | "extracted_text";
  classification_source_note_id: string | null;
  classification_source_field: string | null;
  taxonomy_version: number;
  status: unknown;
  updated_at: Date | string;
  content_match: boolean;
  material_references: unknown;
}

const referenceSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    kind: z.enum(["note", "file", "embedded"]),
  }),
);
const labelsSchema = z.array(z.string().max(60)).max(20);
const associationsSchema = z.array(topicAssociationSchema).max(80);
const statusSchema = z.enum(["unclassified", "classified", "stale", "failed"]);
const normalize = (text: string): string => text.toLowerCase();
const contains = (text: string, query: string): boolean =>
  normalize(text).includes(query);
const compareText = (left: string, right: string): number =>
  normalize(left).localeCompare(normalize(right), "en");

export async function searchStudyMaterials(
  userId: string,
  filters: StudySearchFilters = {},
): Promise<StudySearchResponse> {
  const ownerId = z.uuid().parse(userId);
  const input = studySearchFiltersSchema.parse(filters);
  const query = normalize(input.q ?? "");
  // unchanged source hashes preserve reviewed quotes without translating UTF-16 offsets into SQL character offsets
  const maps = await sql<SearchMapRow[]>`
    SELECT m.id, m.name, m.topics, m.taxonomy_version,
      (SELECT count(*)::int FROM app.study_materials material
       JOIN app.notes n ON n.note_id = material.note_id AND n.user_id = material.user_id
       WHERE material.map_id = m.id AND material.user_id = m.user_id AND material.excluded = FALSE
         AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
         AND EXISTS (SELECT 1 FROM app.tree_items tree WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)) AS material_count,
      ARRAY(SELECT topic->>'id' FROM jsonb_array_elements(m.topics) topic
        WHERE topic->>'reviewed' = 'true' AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(topic->'sources', '[]'::jsonb)) anchor
          WHERE NOT EXISTS (
            SELECT 1 FROM app.notes n
            WHERE n.user_id = m.user_id AND n.note_id::text = anchor->>'noteId'
              AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
              AND EXISTS (SELECT 1 FROM app.tree_items tree WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
              AND anchor->>'field' IN ('content', 'extracted_text')
              AND anchor->>'hash' = encode(sha256(convert_to(
                '[' || to_json(anchor->>'field')::text || ',' || to_json(COALESCE(
                  CASE WHEN anchor->>'field' = 'content' THEN n.content ELSE n.extracted_text END, ''
                ))::text || ']', 'UTF8')), 'hex')
          )
        )) AS current_topic_ids
    FROM app.study_maps m
    WHERE m.user_id = ${ownerId}::uuid
    ORDER BY m.updated_at DESC, m.id
    LIMIT 101
  `;
  if (maps.length > 100)
    throw new ApiError(
      422,
      "Search supports up to 100 study maps. Remove unused maps before searching.",
    );
  if (maps.some((map) => map.material_count > 500)) {
    throw new ApiError(
      422,
      "A study map has more than 500 active materials. Split it into smaller maps before searching.",
    );
  }
  if (maps.length === 0)
    return {
      results: [],
      total: 0,
      limit: input.limit,
      nextOffset: null,
      availableFacets: { maps: [], topics: [], kinds: [], labels: [] },
    };

  const staleTaxonomyMaps = new Set<string>();
  const reviewedTopics = new Map(
    maps.map((map) => {
      const currentIds = new Set(map.current_topic_ids);
      const topics = z.array(topicSchema).max(80).parse(map.topics);
      if (topics.some((topic) => topic.reviewed && !currentIds.has(topic.id)))
        staleTaxonomyMaps.add(map.id);
      return [
        map.id,
        new Map(
          topics
            .filter((topic) => topic.reviewed && currentIds.has(topic.id))
            .map((topic) => [topic.id, topic]),
        ),
      ];
    }),
  );
  const mapsById = new Map(maps.map((map) => [map.id, map]));

  // the binary rule and newest visible text extraction mirror repository.documentFor
  // to_json escapes each string; explicit comma framing matches sourceDocument's JSON.stringify([field, text])
  const rows = await sql<SearchMaterialRow[]>`
    WITH active_notes AS NOT MATERIALIZED (
      SELECT n.note_id, n.title, n.content, n.extracted_text, n.s3_key, n.extracted_from_note_id, n.updated_at,
        (SELECT a.mime_type FROM app.attachments a
         WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
         ORDER BY a.id LIMIT 1) AS mime_type
      FROM app.notes n
      WHERE n.user_id = ${ownerId}::uuid AND n.deleted_at IS NULL AND n.is_folder = FALSE AND n.is_import_cache_source = FALSE
        AND EXISTS (SELECT 1 FROM app.tree_items tree WHERE tree.note_id = n.note_id AND tree.user_id = n.user_id)
    ), typed_notes AS NOT MATERIALIZED (
      SELECT n.*,
        (COALESCE(btrim(n.mime_type), '') ~* '^(image/|video/)|^application/pdf$'
         OR COALESCE(btrim(n.title), '') ~* '\\.(pdf|png|jpg|jpeg|gif|svg|webp|bmp|avif|mp4|webm|ogg|mov|m4v)$'
         OR (COALESCE(n.s3_key, '') <> ''
           AND NOT (lower(btrim(split_part(COALESCE(n.mime_type, ''), ';', 1))) LIKE 'text/%'
             OR lower(btrim(split_part(COALESCE(n.mime_type, ''), ';', 1))) IN ('application/json', 'application/xml'))
           AND COALESCE(n.title, '') !~* '\\.(md|markdown|txt|text|csv|json|xml|html?|rst)$')) AS is_binary
      FROM active_notes n
    ), selected_sources AS (
      SELECT material.note_id, material.map_id, n.title, material.kind, material.labels, material.associations,
        material.overrides, material.source_hash, material.taxonomy_version, material.status,
        material.classification->'rawDecisions'->0->'anchor'->>'noteId' AS classification_source_note_id,
        material.classification->'rawDecisions'->0->'anchor'->>'field' AS classification_source_field,
        greatest(material.updated_at, n.updated_at, derived.updated_at) AS updated_at,
        COALESCE(derived.note_id, n.note_id) AS source_note_id,
        CASE WHEN n.is_binary AND derived.note_id IS NULL THEN 'extracted_text' ELSE 'content' END AS source_field,
        CASE WHEN derived.note_id IS NOT NULL THEN COALESCE(derived.content, '')
          WHEN n.is_binary THEN COALESCE(n.extracted_text, '') ELSE COALESCE(n.content, '') END AS source_text,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', ref.note_id, 'title', COALESCE(ref.title, 'Untitled'),
            'kind', CASE WHEN COALESCE(ref.s3_key, '') <> '' OR ref.is_binary THEN 'file' ELSE 'note' END)
            ORDER BY ref.note_id)
          FROM typed_notes ref
          WHERE ref.note_id <> n.note_id AND (ref.extracted_from_note_id = n.note_id OR ref.note_id = n.extracted_from_note_id)), '[]'::jsonb) AS material_references
      FROM app.study_materials material
      JOIN app.study_maps map ON map.id = material.map_id AND map.user_id = material.user_id
      JOIN typed_notes n ON n.note_id = material.note_id
      LEFT JOIN LATERAL (
        SELECT candidate.note_id, candidate.content, candidate.updated_at FROM typed_notes candidate
        WHERE candidate.extracted_from_note_id = n.note_id AND NOT candidate.is_binary
        ORDER BY candidate.updated_at DESC, candidate.note_id LIMIT 1
      ) derived ON n.is_binary
      WHERE material.user_id = ${ownerId}::uuid AND map.user_id = ${ownerId}::uuid
        AND material.map_id = ANY(${maps.map((map) => map.id)}::uuid[]) AND material.excluded = FALSE
      ORDER BY material.map_id, material.note_id
      LIMIT 50001
    )
    SELECT note_id, map_id, title, kind, labels, associations, overrides, source_hash, taxonomy_version, status,
      updated_at, source_note_id, source_field, classification_source_note_id, classification_source_field, material_references,
      encode(sha256(convert_to('[' || to_json(source_field)::text || ',' || to_json(source_text)::text || ']', 'UTF8')), 'hex') AS current_hash,
      CASE WHEN ${query}::text = '' THEN FALSE ELSE strpos(lower(source_text), ${query}::text) > 0 END AS content_match
    FROM selected_sources
  `;
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(row.map_id, (counts.get(row.map_id) ?? 0) + 1);
  if (
    rows.length > 50_000 ||
    [...counts.values()].some((count) => count > 500)
  ) {
    throw new ApiError(
      422,
      "A study map has more than 500 active materials. Split it into smaller maps before searching.",
    );
  }

  const candidates: Array<{
    result: StudySearchResult;
    score: number;
    matchesQuery: boolean;
  }> = [];
  for (const row of rows) {
    const map = mapsById.get(row.map_id);
    const topicsById = reviewedTopics.get(row.map_id);
    if (!map || !topicsById) continue;
    const overrides = materialOverridesSchema.parse(row.overrides);
    const status = statusSchema.parse(row.status);
    const taxonomyEvidenceStale = staleTaxonomyMaps.has(map.id);
    const classificationIdentityCurrent =
      row.classification_source_note_id === row.source_note_id &&
      row.classification_source_field === row.source_field;
    const classificationCurrent =
      !taxonomyEvidenceStale &&
      status === "classified" &&
      classificationIdentityCurrent &&
      row.source_hash === row.current_hash &&
      row.taxonomy_version === map.taxonomy_version;
    const correctionsCurrent =
      !taxonomyEvidenceStale &&
      overrides.sourceHash === row.current_hash &&
      overrides.taxonomyVersion === map.taxonomy_version;
    const hasCorrections =
      overrides.kind !== undefined ||
      overrides.labels !== undefined ||
      Object.keys(overrides.topics).length > 0;
    const classificationStale =
      (Boolean(row.source_hash) || status === "classified") &&
      (taxonomyEvidenceStale ||
        !classificationIdentityCurrent ||
        row.source_hash !== row.current_hash ||
        row.taxonomy_version !== map.taxonomy_version);
    const associations = new Map<string, TopicAssociation>();
    for (const association of associationsSchema.parse(row.associations)) {
      if (
        classificationCurrent &&
        association.status !== "rejected" &&
        topicsById.has(association.topicId)
      )
        associations.set(association.topicId, association);
    }
    if (correctionsCurrent) {
      for (const [topicId, relevance] of Object.entries(overrides.topics)) {
        if (!topicsById.has(topicId)) continue;
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
    const resultTopics: StudySearchResult["topics"] = [
      ...associations.values(),
    ].flatMap((association) => {
      const topic = topicsById.get(association.topicId);
      if (!topic || association.status === "rejected") return [];
      return [
        {
          id: topic.id,
          name: topic.name,
          relevance: association.relevance,
          status: association.status,
        },
      ];
    });
    const labels =
      correctionsCurrent && overrides.labels !== undefined
        ? overrides.labels
        : classificationCurrent
          ? labelsSchema.parse(row.labels)
          : [];
    const title = row.title ?? "Untitled";
    const topicMatch = resultTopics.some((topic) => {
      const definition = topicsById.get(topic.id);
      return (
        contains(topic.name, query) ||
        definition?.aliases.some((alias) => contains(alias, query))
      );
    });
    const labelMatch = labels.some((label) => contains(label, query));
    const titleMatch = contains(title, query);
    const mapMatch = contains(map.name, query);
    const kind =
      correctionsCurrent && overrides.kind !== undefined
        ? overrides.kind
        : documentKindSchema.parse(row.kind);
    const kindMatch = contains(kind.replaceAll("_", " "), query);
    const score = query
      ? (normalize(title) === query ? 5 : titleMatch ? 3 : 0) +
        (topicMatch ? 2 : 0) +
        (labelMatch ? 2 : 0) +
        (mapMatch ? 1 : 0) +
        (kindMatch ? 1 : 0) +
        (row.content_match ? 1 : 0)
      : 0;
    candidates.push({
      score,
      matchesQuery: !query || score > 0,
      result: {
        noteId: row.note_id,
        title,
        mapId: map.id,
        mapName: map.name,
        kind,
        labels: [...new Set(labels)],
        topics: resultTopics,
        updatedAt: (row.updated_at instanceof Date
          ? row.updated_at
          : new Date(row.updated_at)
        ).toISOString(),
        stale:
          status === "stale" ||
          classificationStale ||
          (hasCorrections && !correctionsCurrent),
        sourceNoteId: row.source_note_id,
        references: referenceSchema.parse(row.material_references),
      },
    });
  }

  // facets describe the entire visible collection, before query, filters, sorting, or limit
  const mapFacets = new Map<
    string,
    StudySearchResponse["availableFacets"]["maps"][number]
  >();
  const topicFacets = new Map<
    string,
    StudySearchResponse["availableFacets"]["topics"][number]
  >();
  const kindFacets = new Map<DocumentKind, number>();
  const labelFacets = new Map<string, { label: string; count: number }>();
  for (const { result } of candidates) {
    const mapFacet = mapFacets.get(result.mapId) ?? {
      id: result.mapId,
      name: result.mapName,
      count: 0,
    };
    mapFacet.count += 1;
    mapFacets.set(result.mapId, mapFacet);
    for (const topic of result.topics) {
      const key = `${result.mapId}:${topic.id}`;
      const topicFacet = topicFacets.get(key) ?? {
        id: topic.id,
        name: topic.name,
        mapId: result.mapId,
        count: 0,
      };
      topicFacet.count += 1;
      topicFacets.set(key, topicFacet);
    }
    kindFacets.set(result.kind, (kindFacets.get(result.kind) ?? 0) + 1);
    for (const label of new Set(result.labels.map(normalize))) {
      const labelFacet = labelFacets.get(label) ?? {
        label: result.labels.find((item) => normalize(item) === label) ?? label,
        count: 0,
      };
      labelFacet.count += 1;
      labelFacets.set(label, labelFacet);
    }
  }
  const filtered = candidates.filter(
    ({ result, matchesQuery }) =>
      matchesQuery &&
      (!input.mapId || result.mapId === input.mapId) &&
      (!input.topicId ||
        result.topics.some((topic) => topic.id === input.topicId)) &&
      (!input.kind || result.kind === input.kind) &&
      (!input.label ||
        result.labels.some(
          (label) => normalize(label) === normalize(input.label ?? ""),
        )),
  );
  filtered.sort((left, right) => {
    let order = 0;
    if (input.sort === "relevance") order = right.score - left.score;
    if (input.sort === "updated")
      order = right.result.updatedAt.localeCompare(left.result.updatedAt);
    if (input.sort === "topics")
      order = right.result.topics.length - left.result.topics.length;
    return (
      order ||
      compareText(left.result.title, right.result.title) ||
      left.result.mapId.localeCompare(right.result.mapId) ||
      left.result.noteId.localeCompare(right.result.noteId)
    );
  });
  const nextOffset =
    input.offset + input.limit < filtered.length
      ? input.offset + input.limit
      : null;
  return {
    results: filtered
      .slice(input.offset, input.offset + input.limit)
      .map(({ result }) => result),
    total: filtered.length,
    limit: input.limit,
    nextOffset,
    availableFacets: {
      maps: [...mapFacets.values()].sort(
        (left, right) =>
          compareText(left.name, right.name) || left.id.localeCompare(right.id),
      ),
      topics: [...topicFacets.values()].sort(
        (left, right) =>
          compareText(left.name, right.name) || left.id.localeCompare(right.id),
      ),
      kinds: [...kindFacets]
        .map(([kind, count]) => ({ kind, count }))
        .sort((left, right) => compareText(left.kind, right.kind)),
      labels: [...labelFacets.values()].sort((left, right) =>
        compareText(left.label, right.label),
      ),
    },
  };
}
