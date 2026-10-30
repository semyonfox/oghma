import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import type { StudyDecisionCache } from "./classification";
import type { StudyGenerationCache } from "./generation";

// both caches only save money: a failed read asks the provider again and a failed write
// keeps the answer the student already paid for instead of failing the whole job

export const decisionCache: StudyDecisionCache = {
  async get(keys) {
    if (!keys.length) return new Map();
    try {
      const rows = await sql<Array<{ key: string; value: unknown }>>`
        SELECT key, value FROM app.study_decision_cache WHERE key = ANY(${keys}::text[])
      `;
      return new Map(rows.map((row) => [row.key, row.value]));
    } catch (error) {
      logger.warn("study decision cache read failed", { error });
      return new Map();
    }
  },
  async set(entries) {
    try {
      for (let index = 0; index < entries.length; index += 500) {
        const batch = entries.slice(index, index + 500);
        await sql`
          INSERT INTO app.study_decision_cache (key, value)
          SELECT key, value::jsonb FROM unnest(${batch.map((entry) => entry.key)}::text[],
            ${batch.map((entry) => JSON.stringify(entry.value))}::text[]) AS t(key, value)
          ON CONFLICT (key) DO NOTHING
        `;
      }
    } catch (error) {
      logger.warn("study decision cache write failed", { error });
    }
  },
};

// a write only follows a usable proposal, so it may replace an older answer that was not
export const generationCache: StudyGenerationCache = {
  async get(key) {
    try {
      const [row] = await sql<Array<{ value: unknown }>>`
        SELECT value FROM app.study_generation_cache WHERE key = ${key}
      `;
      return row?.value;
    } catch (error) {
      logger.warn("study generation cache read failed", { error });
      return undefined;
    }
  },
  async set(key, value) {
    try {
      await sql`
        INSERT INTO app.study_generation_cache (key, value)
        VALUES (${key}, ${JSON.stringify(value)}::text::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, created_at = NOW()
      `;
    } catch (error) {
      logger.warn("study generation cache write failed", { error });
    }
  },
};
