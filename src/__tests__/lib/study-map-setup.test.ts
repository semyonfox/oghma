import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-errors";

const state = vi.hoisted(() => ({
  sql: vi.fn(),
  createStudyMap: vi.fn(),
  configure: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/database/pgsql", () => ({ default: state.sql }));
vi.mock("@/lib/logger", () => ({ default: state.logger }));
vi.mock("@/lib/study-map/mutations", () => ({
  createStudyMap: state.createStudyMap,
}));
vi.mock("@/lib/study-map/jobs", () => ({
  autoConfigureStudyMapSafely: state.configure,
}));

const { setupStudyMaps } = await import("@/lib/study-map/setup");
const { decisionCache, generationCache } =
  await import("@/lib/study-map/cache");

const userId = "11111111-1111-4111-8111-111111111111";
const course = (id: number) => ({
  note_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  title: `CT${id} Course`,
  course_id: String(id),
  academic_year: "2025/26",
});

beforeEach(() => {
  state.sql.mockReset();
  state.createStudyMap.mockReset();
  state.configure.mockReset().mockResolvedValue(null);
  state.logger.warn.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("automatic course map setup", () => {
  it("keeps going past a course that cannot be mapped", async () => {
    state.sql.mockResolvedValue([course(1), course(2), course(3)]);
    state.createStudyMap
      .mockResolvedValueOnce("map-1")
      // the folder was deleted between listing and creating
      .mockRejectedValueOnce(new ApiError(404, "Folder not found"))
      .mockResolvedValueOnce("map-3");
    expect(await setupStudyMaps(userId)).toBe(2);
    expect(state.configure.mock.calls.map(([, mapId]) => mapId)).toEqual([
      "map-1",
      "map-3",
    ]);
  });

  it("stops at the map limit", async () => {
    state.sql.mockResolvedValue([course(1), course(2)]);
    state.createStudyMap.mockRejectedValueOnce(
      new ApiError(400, "You can create up to 100 study maps"),
    );
    expect(await setupStudyMaps(userId)).toBe(0);
    expect(state.createStudyMap).toHaveBeenCalledTimes(1);
  });

  it("creates every map but leaves configuration past its time budget to the worker", async () => {
    vi.useFakeTimers();
    state.sql.mockResolvedValue([course(1), course(2), course(3)]);
    state.createStudyMap.mockImplementation(
      async (_user: string, input: { canvasCourseId: string }) =>
        `map-${input.canvasCourseId}`,
    );
    // a slow descriptor or Canvas fetch uses up the budget on the first course
    state.configure.mockImplementation(async () => {
      vi.advanceTimersByTime(25_000);
      return null;
    });
    expect(await setupStudyMaps(userId)).toBe(3);
    expect(state.configure).toHaveBeenCalledTimes(1);
  });
});

describe("shared study caches", () => {
  it("answer from the provider when the cache table cannot be read or written", async () => {
    state.sql.mockRejectedValue(new Error("connection reset"));
    expect(await decisionCache.get(["a".repeat(64)])).toEqual(new Map());
    await expect(
      decisionCache.set([
        {
          key: "a".repeat(64),
          value: { answer: { type: "noul", noul: 1 }, raw: null, model: "m" },
        },
      ]),
    ).resolves.toBeUndefined();
    expect(await generationCache.get("b".repeat(64))).toBeUndefined();
    await expect(
      generationCache.set("b".repeat(64), { topics: [] }),
    ).resolves.toBeUndefined();
    expect(state.logger.warn).toHaveBeenCalledTimes(4);
  });
});
