import { z } from "zod";
import type {
  TreeItemSummary,
  TreeMoveResult,
  TreeMutationRequest,
} from "@/lib/notes/types/tree";

export interface TreeChildrenResponse {
  parentId: string;
  items: TreeItemSummary[];
}

export interface TreeApi {
  fetch: (signal?: AbortSignal) => Promise<{ items: TreeItemSummary[] } | undefined>;
  fetchChildren: (
    parentId: string | null,
    signal?: AbortSignal,
  ) => Promise<{ items: TreeItemSummary[] } | undefined>;
  mutate: (
    body: TreeMutationRequest,
    signal?: AbortSignal,
  ) => Promise<TreeMoveResult | { success: true } | undefined>;
}

export class TreeRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Tree request failed (${status})`);
    this.name = "TreeRequestError";
  }
}

const childrenSchema = z.object({
  parentId: z.string(),
  items: z.array(z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    isFolder: z.boolean().optional(),
    isExpanded: z.boolean().optional(),
    s3Key: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    pinned: z.union([z.literal(0), z.literal(1)]).optional(),
  })),
});
const successSchema = z.object({ success: z.literal(true) });
const moveSchema = successSchema.extend({
  noteId: z.string(),
  oldParentId: z.string().nullable(),
  newParentId: z.string().nullable(),
});

async function request<T>(url: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
  // The store owns cancellation and scheduling. Sharing GET promises by URL
  // here would let a refresh reuse a read started before its invalidation.
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new TreeRequestError(response.status);
  const body: unknown = await response.json();
  return schema.parse(body);
}

async function fetchChildren(parentId: string | null, signal?: AbortSignal) {
  const url = parentId
    ? `/api/tree/children?parent_id=${encodeURIComponent(parentId)}`
    : "/api/tree/children";
  return request(url, childrenSchema, { signal });
}

export const treeAPI: TreeApi = {
  fetch: (signal) => fetchChildren(null, signal),
  fetchChildren,
  mutate: (body, signal) => {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    };
    return body.action === "move"
      ? request("/api/tree", moveSchema, init)
      : request("/api/tree", successSchema, init);
  },
};

export default function useTreeAPI(): TreeApi {
  return treeAPI;
}
