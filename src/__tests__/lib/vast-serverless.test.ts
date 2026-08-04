import { describe, expect, it, vi } from "vitest";

import {
  requestVastEndpoint,
  vastWorkloadCost,
} from "@/lib/vast-serverless";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const config = {
  endpointName: "oghma-marker",
  endpointApiKey: "endpoint-secret",
  totalTimeoutMs: 10_000,
  workerTimeoutMs: 5_000,
  maxPollIntervalMs: 100,
};

describe("Vast Serverless REST client", () => {
  it("routes and sends the worker envelope used by the current Vast SDK", async () => {
    let clock = 1_000;
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).startsWith("https://run.vast.ai/route/")) {
        return jsonResponse({
          request_idx: 42,
          url: "https://worker.vast.example",
          signature: "signed-route",
        });
      }
      clock += 250;
      return jsonResponse({ success: true, resultKey: "result.json" });
    });

    const result = await requestVastEndpoint(
      "/marker/job",
      { requestId: "job-1" },
      100,
      config,
      {
        fetch: fetchMock as typeof fetch,
        now: () => clock,
        random: () => 0,
        sleep: async () => undefined,
      },
    );

    expect(result.response).toEqual({
      success: true,
      resultKey: "result.json",
    });
    expect(result.metrics).toMatchObject({
      requestIndex: 42,
      routeCalls: 1,
      routePolls: 0,
      workerAttempts: 1,
      workerLatencyMs: 250,
      totalLatencyMs: 250,
    });

    const routeBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(routeBody).toEqual({
      endpoint: "oghma-marker",
      api_key: "endpoint-secret",
      cost: 100,
      request_idx: 0,
      replay_timeout: 60,
    });

    const workerCall = fetchMock.mock.calls[1]!;
    expect(String(workerCall[0])).toContain(
      "https://worker.vast.example/marker/job",
    );
    const workerBody = JSON.parse(
      String((workerCall[1] as RequestInit).body),
    );
    expect(workerBody).toEqual({
      auth_data: {
        request_idx: 42,
        url: "https://worker.vast.example",
        signature: "signed-route",
      },
      session_id: null,
      payload: { requestId: "job-1" },
    });
  });

  it("keeps the router request index while polling a cold endpoint", async () => {
    let clock = 0;
    const routeBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith("https://run.vast.ai/route/")) {
        routeBodies.push(JSON.parse(String(init?.body)));
        if (routeBodies.length === 1) {
          return jsonResponse({ request_idx: 17, status: "waiting" });
        }
        return jsonResponse({
          request_idx: 17,
          url: "https://worker.vast.example",
        });
      }
      return jsonResponse({ success: true });
    });

    const result = await requestVastEndpoint(
      "/marker/job",
      {},
      50,
      config,
      {
        fetch: fetchMock as typeof fetch,
        now: () => clock,
        random: () => 0,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );

    expect(routeBodies.map((body) => body.request_idx)).toEqual([0, 17]);
    expect(result.metrics).toMatchObject({
      requestIndex: 17,
      routeCalls: 2,
      routePolls: 1,
    });
  });

  it("re-routes retryable worker failures within a bounded attempt count", async () => {
    let workerCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).startsWith("https://run.vast.ai/route/")) {
        return jsonResponse({
          request_idx: 7,
          url: "https://worker.vast.example",
        });
      }
      workerCalls += 1;
      return workerCalls === 1
        ? jsonResponse({ error: "busy" }, 503)
        : jsonResponse({ success: true });
    });

    const result = await requestVastEndpoint(
      "/marker/job",
      {},
      100,
      { ...config, maxWorkerAttempts: 2 },
      {
        fetch: fetchMock as typeof fetch,
        now: () => 0,
        random: () => 0,
        sleep: async () => undefined,
      },
    );

    expect(workerCalls).toBe(2);
    expect(result.metrics.workerAttempts).toBe(2);
    expect(result.metrics.routeCalls).toBe(2);
  });

  it("stops polling when the total request deadline expires", async () => {
    let clock = 0;
    const fetchMock = vi.fn(async () =>
      jsonResponse({ request_idx: 9, status: "waiting" }),
    );

    await expect(
      requestVastEndpoint(
        "/marker/job",
        {},
        100,
        { ...config, totalTimeoutMs: 250 },
        {
          fetch: fetchMock as typeof fetch,
          now: () => clock,
          random: () => 0,
          sleep: async (ms) => {
            clock += ms;
          },
        },
      ),
    ).rejects.toThrow("timed out after 250ms");
  });

  it("does not expose the endpoint API key in provider error text", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("endpoint-secret rejected", { status: 401 }),
    );

    await expect(
      requestVastEndpoint(
        "/marker/job",
        {},
        100,
        config,
        {
          fetch: fetchMock as typeof fetch,
          now: () => 0,
          random: () => 0,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow("[redacted] rejected");
  });
});

describe("Vast workload units", () => {
  it("uses a bounded size estimate and a stable unknown-size default", () => {
    expect(vastWorkloadCost(null)).toBe(100);
    expect(vastWorkloadCost(100)).toBe(25);
    expect(vastWorkloadCost(5 * 1024 * 1024)).toBe(500);
    expect(vastWorkloadCost(100 * 1024 * 1024)).toBe(2_000);
  });
});
