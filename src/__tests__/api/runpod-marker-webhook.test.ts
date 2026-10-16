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

  describe("replayed or out-of-order terminal callbacks", () => {
    // evaluate the route's own status guard against one in-memory row, so the
    // test follows whatever predicate the transition statement really uses
    function useRow(status: string) {
      const row = { ...markerJob, status };
      mocks.sql.mockImplementation(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join("?");
          if (text.trimStart().startsWith("SELECT")) return [{ ...row }];
          const guard = /status (NOT )?IN \(([^)]*)\)/.exec(text);
          if (!guard || !text.includes("RETURNING")) return [];
          const listed = guard[2]
            .split(",")
            .map((entry) => entry.trim().replace(/'/g, ""))
            .includes(row.status);
          if (guard[1] ? listed : !listed) return [];
          row.status = String(values[0]);
          return [{ callback_id: callbackId }];
        },
      );
      return row;
    }

    it.each(["completing", "completion_queued", "completion_enqueue_failed"])(
      "does not requeue a completion that is already %s",
      async (status) => {
        const row = useRow(status);

        const response = await POST(
          webhook({ id: "runpod_job_123", status: "COMPLETED" }),
          { params: Promise.resolve({ token: "webhook-token", callbackId }) },
        );

        expect(response.status).toBe(200);
        expect(row.status).toBe(status);
        expect(mocks.enqueueMarkerCompletionJob).not.toHaveBeenCalled();
      },
    );

    it("does not flip a queued completion to failure on a late FAILED callback", async () => {
      const row = useRow("completing");

      const response = await POST(
        webhook({ id: "runpod_job_123", status: "FAILED", error: "worker lost" }),
        { params: Promise.resolve({ token: "webhook-token", callbackId }) },
      );

      expect(response.status).toBe(200);
      expect(row.status).toBe("completing");
      expect(mocks.enqueueMarkerFailureJob).not.toHaveBeenCalled();
    });

    it("advances a row that is still waiting on RunPod", async () => {
      const row = useRow("dispatching");

      const response = await POST(
        webhook({ id: "runpod_job_123", status: "COMPLETED" }),
        { params: Promise.resolve({ token: "webhook-token", callbackId }) },
      );

      expect(response.status).toBe(200);
      expect(row.status).toBe("completion_queued");
      expect(mocks.enqueueMarkerCompletionJob).toHaveBeenCalledWith(callbackId);
    });
  });
});
