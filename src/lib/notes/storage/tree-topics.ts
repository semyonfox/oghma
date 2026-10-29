import { z } from "zod";
import sql from "@/database/pgsql";
import type { TopicMark } from "@/lib/notes/types/note";
import { orderTopicMarks, summariseMaterialTopics, type TopicName } from "@/lib/notes/tree-topics";
import { materialOverridesSchema, topicAssociationSchema } from "@/lib/study-map/types";

interface MaterialMarkRow {
  row_id: string;
  map_id: string;
  associations: unknown;
  overrides: unknown;
  taxonomy_version: number;
  map_taxonomy_version: number;
}

interface MapTopicsRow {
  id: string;
  topics: unknown;
}

const associationsSchema = z.array(topicAssociationSchema);
const topicNamesSchema = z.array(z.object({ id: z.string(), name: z.string() }));

/**
 * Topic marks for a batch of tree rows in two queries, however many rows
 * there are. A PDF and the note extracted from it are one document, so a row
 * borrows its partner's material when it isn't in a map itself.
 */
export async function readTopicMarks(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, TopicMark[]>> {
  const result = new Map<string, TopicMark[]>();
  const ids = [...new Set(noteIds)];
  if (ids.length === 0) return result;

  const rows = await sql<MaterialMarkRow[]>`
    WITH requested AS (
      SELECT DISTINCT unnest(${ids}::uuid[]) AS note_id
    ), pairs AS (
      SELECT r.note_id AS row_id, r.note_id AS material_id, 0 AS preference
      FROM requested r
      UNION ALL
      SELECT r.note_id, n.extracted_from_note_id, 1
      FROM requested r
      JOIN app.notes n ON n.note_id = r.note_id AND n.user_id = ${userId}::uuid
      WHERE n.extracted_from_note_id IS NOT NULL
      UNION ALL
      SELECT r.note_id, n.note_id, 1
      FROM requested r
      JOIN app.notes n ON n.extracted_from_note_id = r.note_id AND n.user_id = ${userId}::uuid
      WHERE n.deleted_at IS NULL
    )
    SELECT DISTINCT ON (p.row_id, material.map_id)
      p.row_id, material.map_id, material.associations, material.overrides,
      material.taxonomy_version, map.taxonomy_version AS map_taxonomy_version
    FROM pairs p
    JOIN app.study_materials material
      ON material.note_id = p.material_id AND material.user_id = ${userId}::uuid AND NOT material.excluded
    JOIN app.notes source ON source.note_id = material.note_id AND source.user_id = material.user_id
      AND source.deleted_at IS NULL
    JOIN app.study_maps map ON map.id = material.map_id AND map.user_id = material.user_id
    ORDER BY p.row_id, material.map_id, p.preference
  `;
  if (rows.length === 0) return result;

  const mapIds = [...new Set(rows.map((row) => row.map_id))];
  const maps = await sql<MapTopicsRow[]>`
    SELECT map.id,
      COALESCE(
        jsonb_agg(jsonb_build_object('id', topic.value->>'id', 'name', topic.value->>'name')
          ORDER BY topic.ordinality) FILTER (WHERE topic.value IS NOT NULL),
        '[]'::jsonb
      ) AS topics
    FROM app.study_maps map
    LEFT JOIN LATERAL jsonb_array_elements(map.topics) WITH ORDINALITY AS topic(value, ordinality) ON true
    WHERE map.user_id = ${userId}::uuid AND map.id = ANY(${mapIds}::uuid[])
    GROUP BY map.id, map.updated_at
    ORDER BY map.updated_at DESC, map.id
  `;
  const topicsByMap = new Map<string, TopicName[]>();
  for (const map of maps) {
    const parsed = topicNamesSchema.safeParse(map.topics);
    if (parsed.success) topicsByMap.set(map.id, parsed.data);
  }

  for (const row of rows) {
    const topics = topicsByMap.get(row.map_id);
    const associations = associationsSchema.safeParse(row.associations);
    const overrides = materialOverridesSchema.safeParse(row.overrides);
    // a malformed row loses its marks rather than the whole folder listing
    if (!topics || !associations.success || !overrides.success) continue;
    const marks = summariseMaterialTopics({
      mapId: row.map_id,
      topics,
      mapTaxonomyVersion: row.map_taxonomy_version,
      materialTaxonomyVersion: row.taxonomy_version,
      associations: associations.data,
      overrides: overrides.data,
    });
    if (marks.length > 0) result.set(row.row_id, [...(result.get(row.row_id) ?? []), ...marks]);
  }
  for (const [id, marks] of result) result.set(id, orderTopicMarks(marks));
  return result;
}
