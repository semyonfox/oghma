import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), {
    begin: vi.fn(),
  }),
  enqueueMarkerCompletionJob: vi.fn(),
  enqueueMarkerDispatchJob: vi.fn(),
  enqueueMarkerFailureJob: vi.fn(),
  getObjectMeta: vi.fn(),
  getExternalSignUrl: vi.fn(),
  getPutSignUrl: vi.fn(),
  requestVastEndpoint: vi.fn(),
  submitRunPodJob: vi.fn(),
  getRunPodJobStatus: vi.fn(),
  cancelRunPodJob: vi.fn(),
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
vi.mock("@/lib/marker/vast", () => ({
  requestVastEndpoint: mocks.requestVastEndpoint,
  vastWorkloadCost: vi.fn(() => 100),
}));
vi.mock("@/lib/marker/runpod", () => ({
  submitRunPodJob: mocks.submitRunPodJob,
  getRunPodJobStatus: mocks.getRunPodJobStatus,
  cancelRunPodJob: mocks.cancelRunPodJob,
}));

import { MarkerDispatchRejectedError } from "@/lib/marker/errors";
import {
  dispatchMarkerJob,
  recoverMarkerDispatchJobs,
  submitMarkerJob,
  MarkerSubmissionCancelledError,
  markerQueueEnabled,
  markerServerlessProvider,
} from "@/lib/marker/serverless";

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

    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
    expect(sqlTexts().join("\n")).toContain("SET status = 'awaiting_result'");
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

    expect(mocks.enqueueMarkerCompletionJob).toHaveBeenCalledWith(
      awaitingResult.callback_id,
    );
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
  });

  it("fails an unanswered job once its signed result upload URL has expired", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString();
    const awaitingResult = {
      ...exhaustedJob,
      status: "awaiting_result",
      dispatch_attempts: 1,
      error: "Vast request timed out after 1200000ms",
      started_at: twoHoursAgo,
      result_url_expires_at: null,
      updated_at: new Date().toISOString(),
    };
    mocks.sql
      .mockResolvedValueOnce([awaitingResult])
      .mockResolvedValueOnce([{ callback_id: awaitingResult.callback_id }]);

    await dispatchMarkerJob(awaitingResult.callback_id);

    expect(mocks.enqueueMarkerFailureJob).toHaveBeenCalledWith(
      awaitingResult.callback_id,
    );
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
  });

  it("keeps waiting while the signed result upload URL is still valid", async () => {
    const awaitingResult = {
      ...exhaustedJob,
      status: "awaiting_result",
      dispatch_attempts: 1,
      error: "Vast request timed out after 1200000ms",
      started_at: new Date(Date.now() - 30 * 60 * 1_000).toISOString(),
      result_url_expires_at: null,
      updated_at: new Date().toISOString(),
    };
    mocks.sql.mockResolvedValueOnce([awaitingResult]);

    await dispatchMarkerJob(awaitingResult.callback_id);

    expect(mocks.enqueueMarkerFailureJob).not.toHaveBeenCalled();
  });

  it("honours the stored URL expiry over the currently configured TTL", async () => {
    const awaitingResult = {
      ...exhaustedJob,
      status: "awaiting_result",
      dispatch_attempts: 1,
      error: "Vast request timed out after 1200000ms",
      // signed with a longer TTL than the default, so started_at + TTL has passed
      started_at: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString(),
      result_url_expires_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    mocks.sql.mockResolvedValueOnce([awaitingResult]);

    await dispatchMarkerJob(awaitingResult.callback_id);

    expect(mocks.enqueueMarkerFailureJob).not.toHaveBeenCalled();
  });

  it("continues recovery of already-paid outcomes while the dispatch kill switch is off", async () => {
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "false";
    mocks.sql.mockImplementation(async (query: TemplateStringsArray) => {
      const statement = query.join("?");
      if (statement.includes("SET status = 'recovering'")) {
        return [{ callback_id: "queued-job" }];
      }
      if (statement.includes("WHERE status = 'awaiting_result'")) {
        return [{ callback_id: exhaustedJob.callback_id }];
      }
      return [];
    });

    await expect(recoverMarkerDispatchJobs()).resolves.toBe(1);

    expect(mocks.enqueueMarkerDispatchJob).toHaveBeenCalledExactlyOnceWith(
      exhaustedJob.callback_id,
    );
    expect(mocks.requestVastEndpoint).not.toHaveBeenCalled();
  });
});

type SqlCall = [TemplateStringsArray, ...unknown[]];

function sqlTexts(): string[] {
  return (mocks.sql.mock.calls as unknown as SqlCall[]).map(([strings]) =>
    strings.join("?"),
  );
}

describe("Marker dispatch outcomes", () => {
  const queuedJob = {
    ...exhaustedJob,
    status: "dispatch_queued",
    dispatch_attempts: 0,
    error: null,
    updated_at: new Date().toISOString(),
  };
  const claimedJob = { ...queuedJob, status: "dispatching", dispatch_attempts: 1 };

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.VAST_MARKER_ENDPOINT_NAME = "oghma-marker";
    process.env.VAST_MARKER_ENDPOINT_API_KEY = "endpoint-key";
    mocks.getObjectMeta.mockResolvedValue(undefined);
    mocks.getExternalSignUrl.mockResolvedValue("https://objects.example/source");
    mocks.getPutSignUrl.mockResolvedValue("https://objects.example/result");
    mocks.enqueueMarkerFailureJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const name of [
      "MARKER_SERVERLESS_DISPATCH_ENABLED",
      "VAST_MARKER_ENDPOINT_NAME",
      "VAST_MARKER_ENDPOINT_API_KEY",
      "RUNPOD_MARKER_ENDPOINT_ID",
      "RUNPOD_API_KEY",
      "RUNPOD_MARKER_WEBHOOK_TOKEN",
      "RUNPOD_MARKER_WEBHOOK_BASE_URL",
      "MARKER_SERVERLESS_URL_TTL_SECONDS",
      "MARKER_RESULT_GRACE_SECONDS",
    ]) {
      delete process.env[name];
    }
  });

  function claimFreshJob() {
    mocks.sql
      .mockResolvedValueOnce([queuedJob])
      .mockResolvedValueOnce([claimedJob])
      .mockResolvedValueOnce([{ callback_id: claimedJob.callback_id }])
      .mockResolvedValueOnce([{ callback_id: claimedJob.callback_id }]);
  }

  it("fails a provider rejection immediately instead of waiting out the grace window", async () => {
    claimFreshJob();
    mocks.requestVastEndpoint.mockRejectedValue(
      new MarkerDispatchRejectedError("Vast route failed (401): bad key"),
    );

    await dispatchMarkerJob(claimedJob.callback_id);

    const transition = sqlTexts().at(-1) ?? "";
    expect(transition).toContain("'failure_queued'");
    expect(mocks.enqueueMarkerFailureJob).toHaveBeenCalledWith(claimedJob.callback_id);
  });

  it("keeps an ambiguous provider error under result observation", async () => {
    claimFreshJob();
    mocks.requestVastEndpoint.mockRejectedValue(
      new Error("Vast worker transport failed after 1 attempt(s)"),
    );

    await dispatchMarkerJob(claimedJob.callback_id);

    const transition = sqlTexts().at(-1) ?? "";
    expect(transition).toContain("'awaiting_result'");
    expect(mocks.enqueueMarkerFailureJob).not.toHaveBeenCalled();
  });

  describe("RunPod", () => {
    const runpodJob = {
      ...claimedJob,
      provider: "runpod",
      provider_job_id: "runpod_job_123",
    };

    beforeEach(() => {
      process.env.RUNPOD_MARKER_ENDPOINT_ID = "endpoint_123";
      process.env.RUNPOD_API_KEY = "runpod-key";
      process.env.RUNPOD_MARKER_WEBHOOK_TOKEN = "webhook-token";
      process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL = "https://app.example";
    });

    it("never lets a queued job outlive its signed URLs", async () => {
      process.env.MARKER_SERVERLESS_URL_TTL_SECONDS = "3600";
      mocks.sql
        .mockResolvedValueOnce([{ ...queuedJob, provider: "runpod" }])
        .mockResolvedValueOnce([{ ...claimedJob, provider: "runpod" }])
        .mockResolvedValueOnce([{ callback_id: claimedJob.callback_id }])
        .mockResolvedValueOnce([{ callback_id: claimedJob.callback_id }]);
      mocks.submitRunPodJob.mockResolvedValue({ jobId: "runpod_job_123", metrics: {} });

      await dispatchMarkerJob(claimedJob.callback_id);

      expect(mocks.submitRunPodJob.mock.calls[0]![1]).toMatchObject({
        ttlSeconds: 3600,
        webhookUrl: `https://app.example/api/internal/marker/webhook-token/${claimedJob.callback_id}`,
      });
      expect(mocks.getExternalSignUrl).toHaveBeenCalledWith(queuedJob.source_key, 3600);
    });

    it("cancels the provider job when the result grace window expires", async () => {
      process.env.MARKER_RESULT_GRACE_SECONDS = "60";
      const stale = {
        ...runpodJob,
        status: "awaiting_result",
        updated_at: new Date(Date.now() - 120_000).toISOString(),
      };
      mocks.sql
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce([{ callback_id: stale.callback_id }]);
      mocks.getRunPodJobStatus.mockResolvedValue({ status: "IN_QUEUE", metrics: {} });
      mocks.cancelRunPodJob.mockResolvedValue(undefined);

      await dispatchMarkerJob(stale.callback_id);

      expect(mocks.cancelRunPodJob).toHaveBeenCalledWith(
        "runpod_job_123",
        expect.objectContaining({ endpointId: "endpoint_123" }),
      );
      expect(mocks.enqueueMarkerFailureJob).toHaveBeenCalledWith(stale.callback_id);
      expect(mocks.submitRunPodJob).not.toHaveBeenCalled();
    });

    it("cancels the provider job once its signed upload URL has expired", async () => {
      const stale = {
        ...runpodJob,
        status: "awaiting_result",
        started_at: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString(),
        result_url_expires_at: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      mocks.sql
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce([{ callback_id: stale.callback_id }]);
      mocks.getRunPodJobStatus.mockResolvedValue({ status: "IN_QUEUE", metrics: {} });
      mocks.cancelRunPodJob.mockResolvedValue(undefined);

      await dispatchMarkerJob(stale.callback_id);

      expect(mocks.cancelRunPodJob).toHaveBeenCalledWith(
        "runpod_job_123",
        expect.objectContaining({ endpointId: "endpoint_123" }),
      );
      expect(mocks.enqueueMarkerFailureJob).toHaveBeenCalledWith(stale.callback_id);
    });

    it("still fails the row when the provider cancel call itself fails", async () => {
      process.env.MARKER_RESULT_GRACE_SECONDS = "60";
      const stale = {
        ...runpodJob,
        status: "awaiting_result",
        updated_at: new Date(Date.now() - 120_000).toISOString(),
      };
      mocks.sql
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce([{ callback_id: stale.callback_id }]);
      mocks.getRunPodJobStatus.mockRejectedValue(new Error("status unavailable"));
      mocks.cancelRunPodJob.mockRejectedValue(new Error("RunPod cancel failed (503)"));

      await dispatchMarkerJob(stale.callback_id);

      expect(mocks.enqueueMarkerFailureJob).toHaveBeenCalledWith(stale.callback_id);
    });
  });
});

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
      async (callback: (tx: typeof mocks.sql) => unknown) =>
        callback(mocks.sql),
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
  });

  it("does not dispatch a standalone note deleted before submission", async () => {
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      submitMarkerJob({ ...input, jobId: null }),
    ).rejects.toBeInstanceOf(MarkerSubmissionCancelledError);
    expect(mocks.enqueueMarkerDispatchJob).not.toHaveBeenCalled();
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
  });
});

const variables = [
  "MARKER_OCR_ENABLED",
  "MARKER_SERVERLESS_PROVIDER",
  "MARKER_SERVERLESS_DISPATCH_ENABLED",
  "STORAGE_PUBLIC_ENDPOINT",
  "VAST_MARKER_ENDPOINT_NAME",
  "VAST_MARKER_ENDPOINT_API_KEY",
  "VAST_API_KEY",
  "RUNPOD_MARKER_ENDPOINT_ID",
  "RUNPOD_API_KEY",
  "RUNPOD_MARKER_WEBHOOK_TOKEN",
  "RUNPOD_MARKER_WEBHOOK_BASE_URL",
];

describe("Marker serverless configuration", () => {
  afterEach(() => {
    for (const variable of variables) delete process.env[variable];
  });

  it("requires the endpoint-scoped Vast key and public object storage", () => {
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_SERVERLESS_PROVIDER = "vast";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
    process.env.VAST_MARKER_ENDPOINT_NAME = "oghma-marker";
    process.env.VAST_MARKER_ENDPOINT_API_KEY = "endpoint-key";

    expect(markerServerlessProvider()).toBe("vast");
    expect(markerQueueEnabled()).toBe(true);

    delete process.env.STORAGE_PUBLIC_ENDPOINT;
    expect(markerQueueEnabled()).toBe(false);
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";

    delete process.env.VAST_MARKER_ENDPOINT_API_KEY;
    process.env.VAST_API_KEY = "broad-account-key";
    expect(markerQueueEnabled()).toBe(false);
  });

  it("uses the dispatch kill switch without discarding provider configuration", () => {
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_SERVERLESS_PROVIDER = "vast";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "false";
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
    process.env.VAST_MARKER_ENDPOINT_NAME = "oghma-marker";
    process.env.VAST_MARKER_ENDPOINT_API_KEY = "endpoint-key";

    expect(markerServerlessProvider()).toBe("vast");
    expect(markerQueueEnabled()).toBe(false);
  });

  it("enables RunPod only when its complete provider configuration and both gates are set", () => {
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_SERVERLESS_PROVIDER = "runpod";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
    process.env.RUNPOD_MARKER_ENDPOINT_ID = "endpoint";
    process.env.RUNPOD_API_KEY = "key";
    process.env.RUNPOD_MARKER_WEBHOOK_TOKEN = "token";
    process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL = "https://app.example";

    expect(markerServerlessProvider()).toBe("runpod");
    expect(markerQueueEnabled()).toBe(true);

    delete process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL;
    expect(markerQueueEnabled()).toBe(false);
  });
});
