import { useCallback } from "react";
import useFetcher from "./fetcher";

interface MutateBody {
  action: "move" | "mutate";
  data: any;
}

interface TreeItem {
  id: string;
  title: string;
  isFolder: boolean;
  isExpanded: boolean;
}

interface FetchChildrenResponse {
  parentId: string;
  items: TreeItem[];
}

export default function useTreeAPI() {
  const { loading, request, abort } = useFetcher();

  const mutate = useCallback(
    async (body: MutateBody) => {
      return request<MutateBody, undefined>(
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
    return request<undefined, FetchChildrenResponse>({
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
      return request<undefined, FetchChildrenResponse>({ method: "GET", url });
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
