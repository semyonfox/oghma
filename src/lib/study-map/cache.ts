import sql from "@/database/pgsql";
import type { StudyDecisionCache } from "./classification";
import type { StudyGenerationCache } from "./generation";

export const decisionCache: StudyDecisionCache = {
  async get(keys) {
    if (!keys.length) return new Map();
    const rows = await sql<Array<{ key: string; value: unknown }>>`
      SELECT key, value FROM app.study_decision_cache WHERE key = ANY(${keys}::text[])
    `;
    return new Map(rows.map((row) => [row.key, row.value]));
  },
  async set(entries) {
    for (let index = 0; index < entries.length; index += 500) {
      const batch = entries.slice(index, index + 500);
      await sql`
        INSERT INTO app.study_decision_cache (key, value)
        SELECT key, value::jsonb FROM unnest(${batch.map((entry) => entry.key)}::text[],
          ${batch.map((entry) => JSON.stringify(entry.value))}::text[]) AS t(key, value)
        ON CONFLICT (key) DO NOTHING
      `;
    }
  },
};

export const generationCache: StudyGenerationCache = {
  async get(key) {
    const [row] = await sql<Array<{ value: unknown }>>`
      SELECT value FROM app.study_generation_cache WHERE key = ${key}
    `;
    return row?.value;
  },
  async set(key, value) {
    await sql`
      INSERT INTO app.study_generation_cache (key, value)
      VALUES (${key}, ${JSON.stringify(value)}::text::jsonb) ON CONFLICT (key) DO NOTHING
    `;
  },
};
