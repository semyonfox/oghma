import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  CanvasClient: vi.fn(),
  parseJobCourses: vi.fn(),
  processCourse: vi.fn(),
  checkAndCompleteJob: vi.fn(),
  decrypt: vi.fn(),
  getStorageProvider: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/canvas/client", () => ({ CanvasClient: mocks.CanvasClient }));
vi.mock("@/lib/canvas/import-discovery", () => ({
  parseJobCourses: mocks.parseJobCourses,
  processCourse: mocks.processCourse,
  processDiscoverJob: vi.fn(),
}));
vi.mock("@/lib/canvas/import-extraction", () => ({
  checkAndCompleteJob: mocks.checkAndCompleteJob,
  processCanvasFile: vi.fn(),
  processDirectExtraction: vi.fn(),
  processExtractionRetry: vi.fn(),
  recoverPendingExtractionRetries: vi.fn(),
  processMarkerComplete: vi.fn(),
  processMarkerFailed: vi.fn(),
}));
vi.mock("@/lib/crypto.ts", () => ({ decrypt: mocks.decrypt }));
vi.mock("@/lib/storage/init.ts", () => ({
  getStorageProvider: mocks.getStorageProvider,
}));

import { processImportJob } from "@/lib/canvas/import-worker";

describe("legacy Canvas import delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges a duplicate without walking courses again", async () => {
    mocks.sql.mockResolvedValueOnce([]);

    await expect(processImportJob("job-1")).resolves.toBe(false);

    expect(mocks.CanvasClient).not.toHaveBeenCalled();
    expect(mocks.processCourse).not.toHaveBeenCalled();
  });

  it("claims the queued generation before running the compatibility pipeline", async () => {
    const courses = [{ id: "course-1" }];
    mocks.sql
      .mockResolvedValueOnce([
        { id: "job-1", user_id: "user-1", course_ids: courses },
      ])
      .mockResolvedValueOnce([
        { canvas_token: "encrypted-token", canvas_domain: "canvas.example" },
      ]);
    mocks.parseJobCourses.mockReturnValue(courses);
    mocks.decrypt.mockReturnValue("plain-token");
    mocks.getStorageProvider.mockReturnValue({});
    mocks.processCourse.mockResolvedValue(undefined);
    mocks.checkAndCompleteJob.mockResolvedValue(true);

    await expect(processImportJob("job-1")).resolves.toBe(true);

    expect(mocks.processCourse).toHaveBeenCalledWith(
      courses[0],
      "user-1",
      expect.objectContaining({ jobId: "job-1" }),
    );
    expect(mocks.checkAndCompleteJob).toHaveBeenCalledWith(
      "job-1",
      "user-1",
    );
  });

  it("fails a legacy job when any course walk rejects", async () => {
    mocks.sql
      .mockResolvedValueOnce([
        { id: "job-1", user_id: "user-1", course_ids: [{ id: "course-1" }] },
      ])
      .mockResolvedValueOnce([
        { canvas_token: "encrypted-token", canvas_domain: "canvas.example" },
      ])
      .mockResolvedValueOnce([]);
    mocks.parseJobCourses.mockReturnValue([{ id: "course-1" }]);
    mocks.decrypt.mockReturnValue("plain-token");
    mocks.getStorageProvider.mockReturnValue({});
    mocks.processCourse.mockRejectedValue(new Error("Canvas course unavailable"));

    await expect(processImportJob("job-1")).resolves.toBe(false);

    expect(mocks.checkAndCompleteJob).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(3);
    expect((mocks.sql.mock.calls[2][0] as TemplateStringsArray).join("?"))
      .toContain("SET status = 'failed'");
  });
});
