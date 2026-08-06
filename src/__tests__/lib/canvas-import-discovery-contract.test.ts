import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/canvas/client.js", () => ({
  CanvasClient: vi.fn(),
}));

vi.mock("@/lib/canvas/import-scheduler.ts", () => ({
  dispatchFairCanvasFiles: vi.fn(),
}));

vi.mock("@/lib/canvas/import-extraction.js", () => ({
  PROCESSABLE_TYPES: new Set(),
  FILE_CONCURRENCY: 1,
  resolveMimeType: vi.fn(),
  fetchResource: vi.fn(),
  isJobCancelled: vi.fn().mockResolvedValue(false),
  downloadAndStoreFile: vi.fn(),
}));

vi.mock("@/lib/crypto.ts", () => ({
  decrypt: vi.fn(() => "token"),
}));

vi.mock("@/lib/logger.ts", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import sql from "@/database/pgsql.js";
import { dispatchFairCanvasFiles } from "@/lib/canvas/import-scheduler.ts";
import {
  parseJobCourses,
  processDiscoverJob,
} from "@/lib/canvas/import-discovery.js";

describe("Canvas import job course contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves signed-bigint course IDs from serialized jobs", () => {
    expect(
      parseJobCourses({
        course_ids: JSON.stringify(["9007199254740993"]),
      }),
    ).toEqual([
      {
        id: "9007199254740993",
        name: "9007199254740993",
        course_code: "",
        term: null,
      },
    ]);
  });

  it("rejects IDs beyond PostgreSQL's signed-bigint range at job parsing", () => {
    expect(() =>
      parseJobCourses({ course_ids: ["9223372036854775808"] }),
    ).toThrow("supported Canvas ID range");
  });

  it("rejects malformed job course collections", () => {
    expect(() => parseJobCourses({ course_ids: { id: "42" } })).toThrow(
      "course_ids must be an array",
    );
  });
});

describe("Canvas discovery finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes a job when discovery only produced forbidden rows", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([
        {
          id: "11111111-1111-4111-8111-111111111111",
          user_id: "22222222-2222-4222-8222-222222222222",
          course_ids: [],
          started_at: new Date(),
        },
      ] as never)
      .mockResolvedValueOnce([
        { canvas_token: "encrypted", canvas_domain: "canvas.example.edu" },
      ] as never)
      .mockResolvedValueOnce([{ count: "10" }] as never)
      .mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111" },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    await expect(
      processDiscoverJob("11111111-1111-4111-8111-111111111111"),
    ).resolves.toBe(true);

    expect(dispatchFairCanvasFiles).not.toHaveBeenCalled();
    const completionQuery = vi.mocked(sql).mock.calls.at(-1)?.[0] as unknown as
      | TemplateStringsArray
      | undefined;
    expect(Array.from(completionQuery ?? []).join("")).toContain(
      "SET status = 'complete'",
    );
  });
});
