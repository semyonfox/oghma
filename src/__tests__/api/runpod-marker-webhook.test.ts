import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  enqueueMarkerCompletionJob: vi.fn(),
  enqueueMarkerFailureJob: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/queue", () => ({
  enqueueMarkerCompletionJob: mocks.enqueueMarkerCompletionJob,
  enqueueMarkerFailureJob: mocks.enqueueMarkerFailureJob,
}));

import { POST } from "@/app/api/internal/marker/[token]/[callbackId]/route";

const callbackId = "11111111-1111-4111-8111-111111111111";
const markerJob = {
  callback_id: callbackId,
  provider: "runpod",
  provider_job_id: "runpod_job_123",
  runpod_job_id: "runpod_job_123",
  status: "awaiting_result",
};

function webhook(body: Record<string, unknown>): Request {
  return new Request(
    `https://app.example/api/internal/marker/webhook-token/${callbackId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("RunPod Marker webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUNPOD_MARKER_WEBHOOK_TOKEN = "webhook-token";
    mocks.enqueueMarkerCompletionJob.mockResolvedValue(undefined);
    mocks.enqueueMarkerFailureJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.RUNPOD_MARKER_WEBHOOK_TOKEN;
  });

  it("queues completion without persisting RunPod output or signed URLs", async () => {
    mocks.sql
      .mockResolvedValueOnce([markerJob])
      .mockResolvedValueOnce([{ callback_id: callbackId }]);

    const response = await POST(
      webhook({
        id: "runpod_job_123",
        status: "COMPLETED",
        output: {
          output: "private document content",
          sourceUrl: "https://objects.example/private-input",
          metrics: { conversionMs: 123 },
        },
      }),
      { params: Promise.resolve({ token: "webhook-token", callbackId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueMarkerCompletionJob).toHaveBeenCalledWith(callbackId);
    const serializedSqlValues = JSON.stringify(
      mocks.sql.mock.calls.flatMap((call) => call.slice(1)),
    );
    expect(serializedSqlValues).not.toContain("private document content");
    expect(serializedSqlValues).not.toContain("private-input");
    expect(serializedSqlValues).toContain("conversionMs");
  });

  it("does not queue a duplicate terminal callback after completion is durable", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ ...markerJob, status: "completed" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      webhook({ id: "runpod_job_123", status: "COMPLETED" }),
      { params: Promise.resolve({ token: "webhook-token", callbackId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueMarkerCompletionJob).not.toHaveBeenCalled();
  });

  it("rejects a callback that does not match the durable RunPod job", async () => {
    mocks.sql.mockResolvedValueOnce([markerJob]);

    const response = await POST(
      webhook({ id: "other_job", status: "COMPLETED" }),
      { params: Promise.resolve({ token: "webhook-token", callbackId }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueueMarkerCompletionJob).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("rejects a terminal callback without the already-recorded RunPod job ID", async () => {
    mocks.sql.mockResolvedValueOnce([markerJob]);

    const response = await POST(
      webhook({ status: "COMPLETED" }),
      { params: Promise.resolve({ token: "webhook-token", callbackId }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.enqueueMarkerCompletionJob).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
});
