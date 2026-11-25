import { z } from "zod";

/**
 * What /api/events tells a tab. Each event only says what to refetch:
 * a tree branch (null is the root), a study map, or the import/export jobs.
 * resync means events may have been missed, so refetch everything shown.
 */
export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tree"), parentId: z.string().nullable() }),
  z.object({ type: z.literal("study"), mapId: z.string() }),
  z.object({ type: z.literal("jobs") }),
  z.object({ type: z.literal("resync") }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;

export const SERVER_EVENT_TYPES = ["tree", "study", "jobs", "resync"] as const satisfies readonly ServerEvent["type"][];
