// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useFetcher from "@/lib/notes/api/fetcher";
import { clearDeduplicationCache, deduplicatedFetch } from "@/lib/notes/api/request-deduplicator";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
  };
}

describe("useFetcher", () => {
  afterEach(() => {
    clearDeduplicationCache();
    vi.unstubAllGlobals();
  });

  it("does not attach a JSON body or content type to GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFetcher());

    await act(async () => {
      await result.current.request({ method: "GET", url: "/api/tree" });
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init).toMatchObject({ method: "GET" });
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it("stays loading until every overlapping request has settled", async () => {
    const resolvers: Array<(response: ReturnType<typeof jsonResponse>) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFetcher());

    let firstRequest!: Promise<unknown>;
    let secondRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current.request({ method: "POST", url: "/api/one" }, {});
      secondRequest = result.current.request({ method: "POST", url: "/api/two" }, {});
    });

    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvers[0](jsonResponse({ success: true }));
      await firstRequest;
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvers[1](jsonResponse({ success: true }));
      await secondRequest;
    });
    expect(result.current.loading).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("deduplicatedFetch", () => {
  beforeEach(() => {
    clearDeduplicationCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares concurrent GET requests but refetches after they settle", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
      .mockResolvedValueOnce(jsonResponse({ revision: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      deduplicatedFetch<{ revision: number }>("/api/tree"),
      deduplicatedFetch<{ revision: number }>("/api/tree"),
    ]);

    expect(first).toEqual({ revision: 1 });
    expect(second).toEqual({ revision: 1 });

    await expect(
      deduplicatedFetch<{ revision: number }>("/api/tree"),
    ).resolves.toEqual({ revision: 2 });
  });

  it("does not deduplicate mutation requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      deduplicatedFetch("/api/tree", { method: "POST" }),
      deduplicatedFetch("/api/tree", { method: "POST" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an old request remove a replacement created after clear", async () => {
    const oldResponse = deferred<ReturnType<typeof jsonResponse>>();
    const newResponse = deferred<ReturnType<typeof jsonResponse>>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    const oldRequest = deduplicatedFetch<{ revision: number }>("/api/note");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    clearDeduplicationCache();
    const newRequest = deduplicatedFetch<{ revision: number }>("/api/note");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    oldResponse.resolve(jsonResponse({ revision: 1 }));
    await expect(oldRequest).resolves.toEqual({ revision: 1 });

    const sharedNewRequest = deduplicatedFetch<{ revision: number }>(
      "/api/note",
    );

    newResponse.resolve(jsonResponse({ revision: 2 }));
    await expect(newRequest).resolves.toEqual({ revision: 2 });
    await expect(sharedNewRequest).resolves.toEqual({ revision: 2 });
  });
});
