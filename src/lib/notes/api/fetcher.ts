// extracted from Notea (MIT License)
import { useRef, useState } from "react";
import { deduplicatedFetch } from "./request-deduplicator";

export interface FetchParams {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  deduplicate?: boolean;
  // surface the failure to the caller as well as recording it in `error`;
  // callers that need the status code (409 conflicts) opt in
  rethrow?: boolean;
}

export class FetchError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(body || `HTTP ${status}`);
    this.name = "FetchError";
  }
}

async function send<ResponseData>(
  params: FetchParams,
  init: RequestInit,
): Promise<ResponseData | undefined> {
  if (params.method === "GET" && params.deduplicate !== false) {
    return deduplicatedFetch<ResponseData>(params.url, init);
  }

  const response = await fetch(params.url, init);
  if (!response.ok) {
    throw new FetchError(response.status, await response.text());
  }
  if (response.status === 204) return;

  return (await response.json()) as ResponseData;
}

export default function useFetcher() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const pendingRequests = useRef(0);

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
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
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

    let failure: { error: unknown } | undefined;
    let data: ResponseData | undefined;
    try {
      data = await send<ResponseData>(params, init);
    } catch (requestError) {
      failure = { error: requestError };
    }

    pendingRequests.current -= 1;
    if (pendingRequests.current === 0) setLoading(false);
    if (abortRef.current === controller) abortRef.current = undefined;

    if (!failure) return data;
    if (!controller.signal.aborted) {
      setError(
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error),
      );
      if (params.rethrow) throw failure.error;
    }
    return undefined;
  }

  function abort() {
    abortRef.current?.abort();
  }

  return { loading, request, abort, error };
}
