export interface RunPodServerlessConfig {
  endpointId: string;
  apiKey: string;
  webhookUrl: string;
  executionTimeoutMs?: number;
  ttlSeconds?: number;
  requestTimeoutMs?: number;
  statusTimeoutMs?: number;
  apiBaseUrl?: string;
}

export interface RunPodJobMetrics {
  providerStatus?: string;
  submitLatencyMs?: number;
  delayTime?: number;
  executionTime?: number;
  workerId?: string;
  appSubmitToHandlerMs?: number;
  containerToBackendReadyMs?: number;
  backendReadyToHandlerMs?: number;
  handlerProcessAgeMs?: number;
  sourceDownloadMs?: number;
  conversionMs?: number;
  handlerPreUploadMs?: number;
  resultUploadMs?: number;
  handlerTotalMs?: number;
  telemetryIntervalSeconds?: number;
  telemetrySampleCount?: number;
  gpuUtilMeanPercent?: number;
  gpuUtilPeakPercent?: number;
  memoryPeakMiB?: number;
  powerMeanWatts?: number;
}

export interface RunPodJobSubmission {
  jobId: string;
  metrics: RunPodJobMetrics;
}

export interface RunPodServerlessDependencies {
  fetch?: typeof fetch;
  now?: () => number;
}

export interface RunPodJobStatus {
  id?: string;
  status?: string;
  metrics: RunPodJobMetrics;
}

const DEFAULT_API_BASE_URL = "https://api.runpod.ai";
const HANDLER_METRIC_FIELDS = [
  "appSubmitToHandlerMs",
  "containerToBackendReadyMs",
  "backendReadyToHandlerMs",
  "handlerProcessAgeMs",
  "sourceDownloadMs",
  "conversionMs",
  "handlerPreUploadMs",
  "resultUploadMs",
  "handlerTotalMs",
  "telemetryIntervalSeconds",
  "telemetrySampleCount",
  "gpuUtilMeanPercent",
  "gpuUtilPeakPercent",
  "memoryPeakMiB",
  "powerMeanWatts",
] as const;

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function safeStatus(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z_]{1,64}$/.test(normalized) ? normalized : undefined;
}

function safeJobId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,256}$/.test(normalized) ? normalized : undefined;
}

function safeWorkerId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : undefined;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("RunPod returned an invalid JSON object");
  }
  return value as Record<string, unknown>;
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return record(JSON.parse(text));
  } catch (error) {
    if (error instanceof Error && error.message !== "RunPod returned an invalid JSON object") {
      throw new Error("RunPod returned invalid JSON");
    }
    throw error;
  }
}

function endpointUrl(
  config: RunPodServerlessConfig,
  operation: string,
  jobId?: string,
): string {
  const endpointId = safeJobId(config.endpointId);
  if (!endpointId) throw new Error("RunPod endpoint ID is invalid");

  let base: URL;
  try {
    base = new URL(config.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  } catch {
    throw new Error("RunPod API base URL is invalid");
  }
  if (
    base.protocol !== "https:" ||
    !base.hostname ||
    base.username ||
    base.password
  ) {
    throw new Error("RunPod API base URL must use HTTPS without credentials");
  }

  const path = jobId
    ? `/v2/${encodeURIComponent(endpointId)}/${operation}/${encodeURIComponent(jobId)}`
    : `/v2/${encodeURIComponent(endpointId)}/${operation}`;
  return new URL(path, base).toString();
}

function verifiedWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RunPod webhook URL is invalid");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("RunPod webhook URL must use HTTPS without credentials");
  }
  return url.toString();
}

function apiKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error("RunPod API key is required");
  return key;
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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`RunPod request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drops input/output/error payloads before RunPod state is stored in Oghma's
 * database or logs. Full Marker output stays only in Oghma object storage.
 */
export function summarizeRunPodJobStatus(value: unknown): RunPodJobStatus {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const id = safeJobId(body.id);
  const status = safeStatus(body.status);
  const delayTime = nonNegativeNumber(body.delayTime);
  const executionTime = nonNegativeNumber(body.executionTime);
  const workerId = safeWorkerId(body.workerId);
  const output = body.output && typeof body.output === "object" && !Array.isArray(body.output)
    ? (body.output as Record<string, unknown>)
    : {};
  const handlerMetrics = output.metrics && typeof output.metrics === "object" && !Array.isArray(output.metrics)
    ? (output.metrics as Record<string, unknown>)
    : {};
  const safeHandlerMetrics = Object.fromEntries(
    HANDLER_METRIC_FIELDS.flatMap((field) => {
      const metric = nonNegativeNumber(handlerMetrics[field]);
      return metric === undefined ? [] : [[field, metric]];
    }),
  ) as Pick<RunPodJobMetrics, (typeof HANDLER_METRIC_FIELDS)[number]>;
  return {
    ...(id ? { id } : {}),
    ...(status ? { status } : {}),
    metrics: {
      ...(status ? { providerStatus: status } : {}),
      ...(delayTime !== undefined ? { delayTime } : {}),
      ...(executionTime !== undefined ? { executionTime } : {}),
      ...(workerId ? { workerId } : {}),
      ...safeHandlerMetrics,
    },
  };
}

/**
 * Submit exactly one asynchronous RunPod job. Callers must not retry this
 * request: a lost response is an ambiguous paid outcome and is recovered from
 * the immutable Oghma result object instead.
 */
export async function submitRunPodJob(
  input: Record<string, unknown>,
  config: RunPodServerlessConfig,
  dependencies: RunPodServerlessDependencies = {},
): Promise<RunPodJobSubmission> {
  const fetchFn = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const key = apiKey(config.apiKey);
  const startedAt = now();
  const response = await fetchWithTimeout(
    fetchFn,
    endpointUrl(config, "run"),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "user-agent": "oghma-marker-serverless/1",
      },
      body: JSON.stringify({
        input,
        webhook: verifiedWebhookUrl(config.webhookUrl),
        policy: {
          executionTimeout: positiveInteger(
            config.executionTimeoutMs,
            30 * 60 * 1_000,
          ),
          ttl: positiveInteger(config.ttlSeconds, 12 * 60 * 60) * 1_000,
        },
      }),
    },
    positiveInteger(config.requestTimeoutMs, 10_000),
  );
  if (!response.ok) {
    // Provider error bodies can echo submitted signed URLs. Keep them out of
    // Oghma logs and leave the durable row in its ambiguous-observation state.
    throw new Error(`RunPod /run failed (${response.status})`);
  }

  const summary = summarizeRunPodJobStatus(parseJson(await response.text()));
  if (!summary.id) throw new Error("RunPod /run response did not include a job ID");
  return {
    jobId: summary.id,
    metrics: {
      ...summary.metrics,
      submitLatencyMs: Math.max(0, now() - startedAt),
    },
  };
}

export async function getRunPodJobStatus(
  jobId: string,
  config: RunPodServerlessConfig,
  dependencies: RunPodServerlessDependencies = {},
): Promise<RunPodJobStatus> {
  const safeId = safeJobId(jobId);
  if (!safeId) throw new Error("RunPod job ID is invalid");
  const response = await fetchWithTimeout(
    dependencies.fetch ?? fetch,
    endpointUrl(config, "status", safeId),
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey(config.apiKey)}`,
        "user-agent": "oghma-marker-serverless/1",
      },
    },
    positiveInteger(config.statusTimeoutMs, 10_000),
  );
  if (!response.ok) {
    throw new Error(`RunPod status failed (${response.status})`);
  }
  return summarizeRunPodJobStatus(parseJson(await response.text()));
}
