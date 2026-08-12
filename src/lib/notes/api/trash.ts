// extracted from Notea (MIT License)
import { useCallback } from "react";
import useFetcher from "./fetcher";

export interface TrashMutationBody {
  action: "restore" | "delete";
  data: { id: string };
}

export interface TrashMutationResponse {
  success: true;
  parentId?: string | null;
}

export interface TrashListItem {
  id: string;
  title: string;
  isFolder: boolean;
  deletedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface TrashListResponse {
  items: TrashListItem[];
}

export default function useTrashAPI() {
  const { loading, request, abort } = useFetcher();

  const mutate = useCallback(
    (body: TrashMutationBody) =>
      request<TrashMutationBody, TrashMutationResponse>(
        {
          method: "POST",
          url: "/api/trash",
        },
        body,
      ),
    [request],
  );

  const list = useCallback(
    async () =>
      (await request<undefined, TrashListResponse>({
        method: "GET",
        url: "/api/trash",
      }))?.items,
    [request],
  );

  return {
    loading,
    abort,
    list,
    mutate,
  };
}
