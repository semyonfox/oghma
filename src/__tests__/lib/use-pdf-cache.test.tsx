// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCacheEntry: vi.fn(),
  putCacheEntry: vi.fn(),
  runEviction: vi.fn(),
}));

vi.mock("@/lib/notes/pdf-cache/store", () => ({
  getCacheEntry: mocks.getCacheEntry,
  putCacheEntry: mocks.putCacheEntry,
}));

vi.mock("@/lib/notes/pdf-cache/evict", () => ({
  runEviction: mocks.runEviction,
}));

import { usePdfCache } from "@/lib/notes/pdf-cache/use-pdf-cache";

describe("usePdfCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCacheEntry.mockResolvedValue(undefined);
    mocks.putCacheEntry.mockResolvedValue(undefined);
    mocks.runEviction.mockResolvedValue(undefined);
  });

  it("returns cached PDF bytes without creating another URL", async () => {
    const buffer = Uint8Array.from([37, 80, 68, 70]).buffer;
    mocks.getCacheEntry.mockResolvedValue({
      s3Key: "notes/example.pdf",
      buffer,
      size: buffer.byteLength,
      cachedAt: 1,
      contentType: "application/pdf",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      usePdfCache("notes/example.pdf", "note-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Array.from(result.current.data ?? [])).toEqual([37, 80, 68, 70]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives PDF.js a copy while retaining the downloaded buffer for the cache", async () => {
    const downloadedBuffer = Uint8Array.from([37, 80, 68, 70, 45]).buffer;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "/api/upload?path=notes%2Fexample.pdf&stream=1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "Content-Type": "application/pdf" }),
        arrayBuffer: async () => downloadedBuffer,
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      usePdfCache("notes/example.pdf", "note-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Array.from(result.current.data ?? [])).toEqual([
      37, 80, 68, 70, 45,
    ]);
    expect(result.current.data?.buffer).not.toBe(downloadedBuffer);
    expect(mocks.putCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Key: "notes/example.pdf",
        buffer: downloadedBuffer,
        size: downloadedBuffer.byteLength,
        contentType: "application/pdf",
      }),
    );
  });

  it("loads from the network when IndexedDB is unavailable", async () => {
    const downloadedBuffer = Uint8Array.from([37, 80, 68, 70]).buffer;
    mocks.getCacheEntry.mockRejectedValue(new Error("IndexedDB disabled"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: "/api/upload?path=notes%2Fexample.pdf&stream=1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "Content-Type": "application/pdf" }),
          arrayBuffer: async () => downloadedBuffer,
        }),
    );

    const { result } = renderHook(() =>
      usePdfCache("notes/example.pdf", "note-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Array.from(result.current.data ?? [])).toEqual([37, 80, 68, 70]);
    expect(result.current.error).toBeNull();
  });

  it("does not keep showing the previous PDF when the next load fails", async () => {
    const firstBuffer = Uint8Array.from([37, 80, 68, 70]).buffer;
    mocks.getCacheEntry
      .mockResolvedValueOnce({
        s3Key: "notes/first.pdf",
        buffer: firstBuffer,
        size: firstBuffer.byteLength,
        cachedAt: 1,
      })
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const { result, rerender } = renderHook(
      ({ sourcePath }) => usePdfCache(sourcePath, "note-1"),
      { initialProps: { sourcePath: "notes/first.pdf" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();

    rerender({ sourcePath: "notes/missing.pdf" });

    await waitFor(() => expect(result.current.error).toBe("http-404"));
    expect(result.current.data).toBeNull();
  });
});
