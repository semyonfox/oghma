const DEFAULT_ROUTER_URL = "https://run.vast.ai/route/";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface VastServerlessConfig {
  endpointName: string;
  endpointApiKey: string;
  routerUrl?: string;
  totalTimeoutMs?: number;
  workerTimeoutMs?: number;
  maxWorkerAttempts?: number;
  maxPollIntervalMs?: number;
  replayTimeoutSeconds?: number;
  allowInsecureWorkerUrl?: boolean;
}

export interface VastRequestMetrics {
  requestIndex: number;
  routeCalls: number;
  routePolls: number;
  workerAttempts: number;
  queueWaitMs: number;
  workerLatencyMs: number;
  totalLatencyMs: number;
}

export interface VastServerlessResult<T> {
  response: T;
  metrics: VastRequestMetrics;
}

export interface VastServerlessDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

interface RouteResponse {
  request_idx?: number | string;
  url?: string;
  [key: string]: unknown;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

function withApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("api_key", apiKey);
  return parsed.toString();
}

function sanitizeDetail(detail: string, apiKey: string): string {
  return detail.replaceAll(apiKey, "[redacted]").slice(0, 512);
}

function parseJson(text: string, context: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("response is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${context} returned invalid JSON`);
  }
}

function requestIndexFrom(route: RouteResponse, previous: number): number {
  const value =
    typeof route.request_idx === "string"
      ? Number.parseInt(route.request_idx, 10)
      : route.request_idx;
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : previous;
}

function workerUrlFrom(
  route: RouteResponse,
  allowInsecureWorkerUrl: boolean,
): string | null {
  if (typeof route.url !== "string" || !route.url) return null;
  const parsed = new URL(route.url);
  if (
    parsed.protocol !== "https:" &&
    !(allowInsecureWorkerUrl && parsed.protocol === "http:")
  ) {
    throw new Error("Vast routed worker URL must use HTTPS");
  }
  return route.url.replace(/\/+$/, "");
}

function backoffMs(
  attempt: number,
  maxIntervalMs: number,
  random: () => number,
): number {
  const exponential = Math.min(2 ** Math.min(attempt, 20) * 100, maxIntervalMs);
  return Math.max(100, Math.round(exponential * (0.5 + random() * 0.5)));
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function vastWorkloadCost(sourceBytes: number | null | undefined): number {
  if (!Number.isFinite(sourceBytes) || sourceBytes! <= 0) return 100;
  return Math.max(
    25,
    Math.min(2_000, Math.round((sourceBytes! / (1024 * 1024)) * 100)),
  );
}

export async function requestVastEndpoint<T extends Record<string, unknown>>(
  workerRoute: string,
  payload: Record<string, unknown>,
  cost: number,
  config: VastServerlessConfig,
  dependencies: VastServerlessDependencies = {},
): Promise<VastServerlessResult<T>> {
  if (!config.endpointName.trim() || !config.endpointApiKey.trim()) {
    throw new Error("Vast endpoint name and endpoint API key are required");
  }
  if (!workerRoute.startsWith("/")) {
    throw new Error("Vast worker route must start with /");
  }

  const fetchFn = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  const totalTimeoutMs = positiveInteger(config.totalTimeoutMs, 20 * 60_000);
  const workerTimeoutMs = positiveInteger(config.workerTimeoutMs, 15 * 60_000);
  const maxWorkerAttempts = positiveInteger(config.maxWorkerAttempts, 3);
  const maxPollIntervalMs = positiveInteger(config.maxPollIntervalMs, 5_000);
  const replayTimeoutSeconds = positiveInteger(config.replayTimeoutSeconds, 60);
  const routerUrl = config.routerUrl ?? DEFAULT_ROUTER_URL;
  const apiKey = config.endpointApiKey.trim();
  const startedAt = now();
  const deadline = startedAt + totalTimeoutMs;
  let requestIndex = 0;
  let routeCalls = 0;
  let routePolls = 0;
  let workerAttempts = 0;
  let routeReadyAt = startedAt;

  const remainingMs = (): number => {
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(`Vast request timed out after ${totalTimeoutMs}ms`);
    }
    return remaining;
  };

  while (workerAttempts < maxWorkerAttempts) {
    let routeBody: RouteResponse;
    let workerBaseUrl: string | null = null;
    let pollAttempt = 0;

    while (!workerBaseUrl) {
      const routeRequest = {
        endpoint: config.endpointName.trim(),
        api_key: apiKey,
        cost: Math.max(0, Math.round(cost)),
        request_idx: requestIndex,
        replay_timeout: replayTimeoutSeconds,
      };
      routeCalls += 1;

      let routeResponse: Response;
      try {
        routeResponse = await fetchWithTimeout(
          fetchFn,
          withApiKey(routerUrl, apiKey),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
              "user-agent": "oghma-marker-serverless/1",
            },
            body: JSON.stringify(routeRequest),
          },
          Math.min(10_000, remainingMs()),
        );
      } catch {
        if (now() >= deadline) remainingMs();
        pollAttempt += 1;
        await sleep(backoffMs(pollAttempt, maxPollIntervalMs, random));
        continue;
      }

      const routeText = await routeResponse.text();
      if (!routeResponse.ok) {
        if (RETRYABLE_STATUS.has(routeResponse.status)) {
          pollAttempt += 1;
          await sleep(backoffMs(pollAttempt, maxPollIntervalMs, random));
          continue;
        }
        throw new Error(
          `Vast route failed (${routeResponse.status}): ${sanitizeDetail(routeText || routeResponse.statusText, apiKey)}`,
        );
      }

      routeBody = parseJson(routeText, "Vast route") as RouteResponse;
      requestIndex = requestIndexFrom(routeBody, requestIndex);
      workerBaseUrl = workerUrlFrom(
        routeBody,
        config.allowInsecureWorkerUrl === true,
      );
      if (!workerBaseUrl) {
        routePolls += 1;
        pollAttempt += 1;
        await sleep(backoffMs(pollAttempt, maxPollIntervalMs, random));
      }
    }

    routeReadyAt = now();
    workerAttempts += 1;
    let workerResponse: Response;
    try {
      workerResponse = await fetchWithTimeout(
        fetchFn,
        withApiKey(`${workerBaseUrl}${workerRoute}`, apiKey),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "user-agent": "oghma-marker-serverless/1",
          },
          body: JSON.stringify({
            auth_data: routeBody!,
            session_id: null,
            payload,
          }),
        },
        Math.min(workerTimeoutMs, remainingMs()),
      );
    } catch {
      requestIndex = 0;
      if (workerAttempts >= maxWorkerAttempts) {
        throw new Error(
          `Vast worker transport failed after ${workerAttempts} attempt(s)`,
        );
      }
      await sleep(backoffMs(workerAttempts, maxPollIntervalMs, random));
      continue;
    }

    const workerText = await workerResponse.text();
    if (!workerResponse.ok) {
      if (
        RETRYABLE_STATUS.has(workerResponse.status) &&
        workerAttempts < maxWorkerAttempts
      ) {
        await sleep(backoffMs(workerAttempts, maxPollIntervalMs, random));
        continue;
      }
      throw new Error(
        `Vast worker failed (${workerResponse.status}): ${sanitizeDetail(workerText || workerResponse.statusText, apiKey)}`,
      );
    }

    const completedAt = now();
    return {
      response: parseJson(workerText, "Vast worker") as T,
      metrics: {
        requestIndex,
        routeCalls,
        routePolls,
        workerAttempts,
        queueWaitMs: Math.max(0, routeReadyAt - startedAt),
        workerLatencyMs: Math.max(0, completedAt - routeReadyAt),
        totalLatencyMs: Math.max(0, completedAt - startedAt),
      },
    };
  }

  throw new Error(`Vast worker failed after ${maxWorkerAttempts} attempt(s)`);
}
