import { useCallback } from "react";
import useFetcher from "./fetcher";
import type {
  TreeItemSummary,
  TreeMutationRequest,
} from "@/lib/notes/types/tree";

export interface TreeChildrenResponse {
  parentId: string;
  items: TreeItemSummary[];
}

export default function useTreeAPI() {
  const { loading, request, abort } = useFetcher();

  const mutate = useCallback(
    async (body: TreeMutationRequest) => {
      return request<TreeMutationRequest, { success: true }>(
        {
          method: "POST",
          url: `/api/tree`,
        },
        body,
      );
    },
    [request],
  );

  // Fetch root items only (lazy-loading)
  const fetch = useCallback(async () => {
    return request<undefined, TreeChildrenResponse>({
      method: "GET",
      url: "/api/tree/children",
    });
  }, [request]);

  // Fetch children of a specific folder
  const fetchChildren = useCallback(
    async (parentId: string | null) => {
      const url = parentId
        ? `/api/tree/children?parent_id=${encodeURIComponent(parentId)}`
        : "/api/tree/children";
      return request<undefined, TreeChildrenResponse>({ method: "GET", url });
    },
    [request],
  );

  return {
    loading,
    abort,
    mutate,
    fetch,
    fetchChildren,
  };
}
