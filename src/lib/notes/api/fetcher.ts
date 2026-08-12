// extracted from Notea (MIT License)
import { useCallback, useRef, useState } from "react";
import { deduplicatedFetch } from "./request-deduplicator";

export interface FetchParams {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
}

export default function useFetcher() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const pendingRequests = useRef(0);

  const request = useCallback(
    async function request<Payload, ResponseData>(
      params: FetchParams,
      payload?: Payload | FormData,
    ): Promise<ResponseData | undefined> {
      const controller = new AbortController();
      const headers = { ...params.headers };
      let body: BodyInit | undefined;

      if (payload instanceof FormData) {
        body = payload;
      } else if (payload !== undefined) {
        body = JSON.stringify(payload);
        headers["Content-Type"] ??= "application/json";
      }

      const init: RequestInit = {
        method: params.method,
        signal: controller.signal,
        ...(body !== undefined ? { body } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };

      pendingRequests.current += 1;
      setLoading(true);
      setError("");
      abortRef.current = controller;

      try {
        if (params.method === "GET") {
          return await deduplicatedFetch<ResponseData>(params.url, init);
        }

        const response = await fetch(params.url, init);
        if (!response.ok) throw await response.text();
        if (response.status === 204) return;

        return (await response.json()) as ResponseData;
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(String(requestError));
        }
      } finally {
        pendingRequests.current -= 1;
        if (pendingRequests.current === 0) setLoading(false);
        if (abortRef.current === controller) abortRef.current = undefined;
      }
    },
    [],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { loading, request, abort, error };
}
