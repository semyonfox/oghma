import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = vi.fn() as any;
  sql.begin = vi.fn(async (callback: (tx: typeof sql) => unknown) =>
    callback(sql),
  );
  return {
    sql,
    enqueueMarkerDispatchJob: vi.fn(),
  };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/queue", () => ({
  enqueueMarkerCompletionJob: vi.fn(),
  enqueueMarkerDispatchJob: mocks.enqueueMarkerDispatchJob,
  enqueueMarkerFailureJob: vi.fn(),
}));

import {
  MarkerSubmissionCancelledError,
  submitMarkerJob,
} from "@/lib/marker-serverless";

const input = {
  sourceKey: "canvas/user/file.pdf",
  sourceBytes: 1024,
  noteId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  jobId: "33333333-3333-4333-8333-333333333333",
  filename: "lecture.pdf",
  mimeType: "application/pdf",
  parentFolderId: null,
};

describe("Marker submission cancellation fence", () => {
  beforeEach(() => {
    mocks.sql.mockReset();
    mocks.sql.begin.mockClear();
    mocks.sql.begin.mockImplementation(
      async (callback: (tx: typeof mocks.sql) => unknown) => callback(mocks.sql),
    );
    mocks.enqueueMarkerDispatchJob.mockReset();
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_SERVERLESS_PROVIDER = "vast";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
    process.env.VAST_MARKER_ENDPOINT_NAME = "oghma-marker";
    process.env.VAST_MARKER_ENDPOINT_API_KEY = "endpoint-key";
  });

  afterEach(() => {
    for (const variable of [
      "MARKER_OCR_ENABLED",
      "MARKER_SERVERLESS_PROVIDER",
      "MARKER_SERVERLESS_DISPATCH_ENABLED",
      "STORAGE_PUBLIC_ENDPOINT",
      "VAST_MARKER_ENDPOINT_NAME",
      "VAST_MARKER_ENDPOINT_API_KEY",
    ]) {
      delete process.env[variable];
    }
  });

  it("does not create or enqueue GPU work after cancellation wins", async () => {
    // The first transaction query is the active Canvas-job lock/check.
    mocks.sql.mockResolvedValueOnce([]);

    await expect(submitMarkerJob(input)).rejects.toBeInstanceOf(
      MarkerSubmissionCancelledError,
    );

    expect(mocks.enqueueMarkerDispatchJob).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("reuses an already-active Marker row instead of creating a second GPU job", async () => {
    const existing = {
      callback_id: "44444444-4444-4444-8444-444444444444",
      provider: "vast",
      result_key: "marker-results/44444444-4444-4444-8444-444444444444.json",
      status: "dispatching",
    };
    mocks.sql
      .mockResolvedValueOnce([{ id: input.jobId }])
      .mockResolvedValueOnce([existing]);

    await expect(submitMarkerJob(input)).resolves.toEqual({
      markerJobId: existing.callback_id,
      provider: "vast",
      resultKey: existing.result_key,
    });

    expect(mocks.enqueueMarkerDispatchJob).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
});
