// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useFetcher from "@/lib/notes/api/fetcher";
import { clearDeduplicationCache } from "@/lib/notes/api/request-deduplicator";

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
