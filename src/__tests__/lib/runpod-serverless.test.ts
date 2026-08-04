import { describe, expect, it, vi } from "vitest";

import {
  getRunPodJobStatus,
  submitRunPodJob,
  summarizeRunPodJobStatus,
} from "@/lib/runpod-serverless";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const config = {
  endpointId: "endpoint_123",
  apiKey: "runpod-secret",
  webhookUrl: "https://app.example/api/internal/marker/token/callback",
  executionTimeoutMs: 1_800_000,
  ttlSeconds: 43_200,
};

describe("RunPod Serverless client", () => {
  it("submits one asynchronous job with the bounded execution policy", async () => {
    let now = 1_000;
    const fetchMock = vi.fn(async (
      _url: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> => {
      now += 25;
      return jsonResponse({ id: "job_123", status: "IN_QUEUE" });
    });

    const result = await submitRunPodJob(
      { requestId: "opaque-callback" },
      config,
      { fetch: fetchMock as typeof fetch, now: () => now },
    );

    expect(result).toEqual({
      jobId: "job_123",
      metrics: { providerStatus: "IN_QUEUE", submitLatencyMs: 25 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.runpod.ai/v2/endpoint_123/run");
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer runpod-secret",
        "content-type": "application/json",
      }),
    });
    expect(JSON.parse(String(init!.body))).toEqual({
      input: { requestId: "opaque-callback" },
      webhook: config.webhookUrl,
      policy: { executionTimeout: 1_800_000, ttl: 43_200_000 },
    });
  });

  it("does not reflect a provider error body that could contain signed URLs", async () => {
    const fetchMock = vi.fn(async (
      _url: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> =>
      new Response("https://objects.example/private-signed-url", { status: 401 }));

    await expect(
      submitRunPodJob({}, config, { fetch: fetchMock as typeof fetch }),
    ).rejects.toThrow("RunPod /run failed (401)");
  });

  it("keeps only safe scalar status and handler metrics", async () => {
    const summary = summarizeRunPodJobStatus({
      id: "job_123",
      status: "completed",
      delayTime: 230,
      executionTime: 4_500,
      workerId: "worker_123",
      error: "https://objects.example/private-signed-url",
      input: { sourceUrl: "https://objects.example/private-signed-url" },
      output: {
        output: "private document text",
        metrics: {
          sourceDownloadMs: 12.5,
          conversionMs: 456,
          unknown: 1,
          signedUrl: "https://objects.example/private-signed-url",
        },
      },
    });

    expect(summary).toEqual({
      id: "job_123",
      status: "COMPLETED",
      metrics: {
        providerStatus: "COMPLETED",
        delayTime: 230,
        executionTime: 4_500,
        workerId: "worker_123",
        sourceDownloadMs: 12.5,
        conversionMs: 456,
      },
    });
  });

  it("uses the status endpoint without reading input, output, or error", async () => {
    const fetchMock = vi.fn(async (
      _url: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> =>
      jsonResponse({
        id: "job_123",
        status: "IN_PROGRESS",
        output: { output: "private document text" },
      }));

    const result = await getRunPodJobStatus("job_123", config, {
      fetch: fetchMock as typeof fetch,
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.runpod.ai/v2/endpoint_123/status/job_123",
    );
    expect(result).toEqual({
      id: "job_123",
      status: "IN_PROGRESS",
      metrics: { providerStatus: "IN_PROGRESS" },
    });
  });
});
