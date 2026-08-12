// @vitest-environment jsdom

import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useCanvasImport from "@/components/settings/canvas/use-canvas-import";

function statusResponse(forbiddenCourseId: string) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      activeJob: { phase: "processing" },
      progress: null,
      recentLogs: [{ status: "forbidden", courseId: forbiddenCourseId }],
    }),
  };
}

describe("useCanvasImport polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps every restriction reported during a long-running poll", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("course-a"))
      .mockResolvedValueOnce(statusResponse("course-b"));
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => {
      const [courseErrors, setCourseErrors] = React.useState<Record<string, string>>({});
      const [forbiddenCourses, setForbiddenCourses] = React.useState<Record<string, boolean>>({});
      const [syncedCourses, setSyncedCourses] = React.useState<Record<string, boolean>>({});
      const [, setConnectionError] = React.useState<string | null>(null);

      return {
        forbiddenCourses,
        importer: useCanvasImport({
          selectedCourseIds: [],
          courses: [],
          courseErrors,
          setCourseErrors,
          forbiddenCourses,
          setForbiddenCourses,
          syncedCourses,
          setSyncedCourses,
          setConnectionError,
          t: (key) => key,
        }),
      };
    });

    act(() => result.current.importer.startPolling());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.forbiddenCourses).toEqual({
      "course-a": true,
      "course-b": true,
    });

    act(() => result.current.importer.stopPolling());
    unmount();
  });
});
