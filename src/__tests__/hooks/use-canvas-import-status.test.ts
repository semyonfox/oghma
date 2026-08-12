// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanvasImportStatus } from "@/hooks/useCanvasImportStatus";

describe("useCanvasImportStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("recovers from a stale local job record before checking the current status", async () => {
    localStorage.setItem("canvas_active_job", "not-json");
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/canvas/status") {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, activeJob: null }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ available: false }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useCanvasImportStatus());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/canvas/status",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(localStorage.getItem("canvas_active_job")).toBeNull();
  });
});
