import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  enqueueMarkerCompletionJob: vi.fn(),
  enqueueMarkerDispatchJob: vi.fn(),
  enqueueMarkerFailureJob: vi.fn(),
  getObjectMeta: vi.fn(),
  getExternalSignUrl: vi.fn(),
  getPutSignUrl: vi.fn(),
  requestVastEndpoint: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/queue", () => ({
  enqueueMarkerCompletionJob: mocks.enqueueMarkerCompletionJob,
  enqueueMarkerDispatchJob: mocks.enqueueMarkerDispatchJob,
  enqueueMarkerFailureJob: mocks.enqueueMarkerFailureJob,
}));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({
    getObjectMeta: mocks.getObjectMeta,
    getExternalSignUrl: mocks.getExternalSignUrl,
    getPutSignUrl: mocks.getPutSignUrl,
  }),
}));
vi.mock("@/lib/vast-serverless", () => ({
  requestVastEndpoint: mocks.requestVastEndpoint,
  vastWorkloadCost: vi.fn(() => 100),
}));

import { dispatchMarkerJob } from "@/lib/marker-serverless";

const exhaustedJob = {
  callback_id: "11111111-1111-4111-8111-111111111111",
  provider: "vast",
  provider_job_id: null,
  runpod_job_id: null,
  note_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  canvas_job_id: null,
  parent_folder_id: null,
  filename: "lecture.pdf",
  mime_type: "application/pdf",
  source_key: "sources/lecture.pdf",
  source_bytes: 1024,
  result_key: "marker-results/result.json",
  status: "dispatch_retry",
  error: "worker timed out",
  dispatch_attempts: 3,
};

describe("Marker durable dispatch limits", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    process.env.MARKER_DISPATCH_MAX_ATTEMPTS = "3";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.VAST_MARKER_ENDPOINT_NAME = "oghma-marker";
    process.env.VAST_MARKER_ENDPOINT_API_KEY = "endpoint-key";
    mocks.getObjectMeta.mockResolvedValue(undefined);
    mocks.enqueueMarkerFailureJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.MARKER_DISPATCH_MAX_ATTEMPTS;
    delete process.env.MARKER_SERVERLESS_DISPATCH_ENABLED;
    delete process.env.VAST_MARKER_ENDPOINT_NAME;
    delete process.env.VAST_MARKER_ENDPOINT_API_KEY;
  });

  it("moves an ambiguous legacy retry to result observation without another paid provider call", async () => {
    mocks.sql.mockResolvedValueOnce([exhaustedJob]);

    await dispatchMarkerJob(exhaustedJob.callback_id);

    expect(mocks.getObjectMeta).not.toHaveBeenCalled();
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
    expect(mocks.getExternalSignUrl).not.toHaveBeenCalled();
    expect(mocks.getPutSignUrl).not.toHaveBeenCalled();
    expect(mocks.enqueueMarkerFailureJob).not.toHaveBeenCalled();
  });

  it("does not revive a cancelled job when a prior GPU attempt left a result", async () => {
    const dispatchingJob = {
      ...exhaustedJob,
      status: "dispatching",
      dispatch_attempts: 1,
      error: null,
    };
    mocks.sql
      .mockResolvedValueOnce([dispatchingJob])
      .mockResolvedValueOnce([dispatchingJob])
      // Cancellation won the state transition before completion was queued.
      .mockResolvedValueOnce([]);
    mocks.getObjectMeta.mockResolvedValue({ contentLength: 32 });

    await dispatchMarkerJob(dispatchingJob.callback_id);

    expect(mocks.enqueueMarkerCompletionJob).not.toHaveBeenCalled();
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
  });

  it("observes an immutable result after an ambiguous response without redispatching", async () => {
    const awaitingResult = {
      ...exhaustedJob,
      status: "awaiting_result",
      dispatch_attempts: 1,
      error: "Vast worker transport failed",
      updated_at: new Date().toISOString(),
    };
    mocks.sql
      .mockResolvedValueOnce([awaitingResult])
      .mockResolvedValueOnce([{ callback_id: awaitingResult.callback_id }]);
    mocks.getObjectMeta.mockResolvedValue({ contentLength: 512 });
    mocks.enqueueMarkerCompletionJob.mockResolvedValue(undefined);

    await dispatchMarkerJob(awaitingResult.callback_id);

    expect(mocks.getObjectMeta).toHaveBeenCalledWith(awaitingResult.result_key);
    expect(mocks.enqueueMarkerCompletionJob).toHaveBeenCalledWith(
      awaitingResult.callback_id,
    );
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
  });
});
