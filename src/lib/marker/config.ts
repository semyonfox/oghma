// env switches shared by the direct Marker client, the serverless dispatcher
// and worker startup validation. keeping them in one place stops the three
// paths from disagreeing about what counts as "enabled"

export type MarkerServerlessProvider = "vast" | "runpod";

export function envFlag(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(
    value?.trim().toLowerCase() ?? "",
  );
}

export function positiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function isHttpsUrlWithoutCredentials(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function markerOcrEnabled(): boolean {
  return envFlag(process.env.MARKER_OCR_ENABLED);
}

export function markerDispatchEnabled(): boolean {
  // GPU dispatch must be explicitly enabled; a credential alone must never
  // turn a deployment into a paid external-processing path.
  return envFlag(process.env.MARKER_SERVERLESS_DISPATCH_ENABLED);
}

export function processAllPdfsWithMarker(): boolean {
  return envFlag(process.env.MARKER_PROCESS_ALL_PDFS);
}

export function markerServerlessProvider(): MarkerServerlessProvider | null {
  const configured = process.env.MARKER_SERVERLESS_PROVIDER
    ?.trim()
    .toLowerCase();
  return configured === "vast" || configured === "runpod" ? configured : null;
}

export function vastConfigured(): boolean {
  return Boolean(
    process.env.VAST_MARKER_ENDPOINT_NAME?.trim() &&
      process.env.VAST_MARKER_ENDPOINT_API_KEY?.trim(),
  );
}

export function runpodConfigured(): boolean {
  return Boolean(
    process.env.RUNPOD_MARKER_ENDPOINT_ID?.trim() &&
      process.env.RUNPOD_API_KEY?.trim() &&
      process.env.RUNPOD_MARKER_WEBHOOK_TOKEN?.trim() &&
      isHttpsUrlWithoutCredentials(
        process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL?.trim(),
      ),
  );
}

export function markerServerlessConfigured(): boolean {
  if (!isHttpsUrlWithoutCredentials(process.env.STORAGE_PUBLIC_ENDPOINT?.trim())) {
    return false;
  }
  const provider = markerServerlessProvider();
  return (
    (provider === "vast" && vastConfigured()) ||
    (provider === "runpod" && runpodConfigured())
  );
}

export function markerQueueEnabled(): boolean {
  return (
    markerOcrEnabled() && markerDispatchEnabled() && markerServerlessConfigured()
  );
}

/** Lifetime of the signed source/result URLs handed to a GPU worker. */
export function markerSignedUrlTtlSeconds(): number {
  return positiveIntEnv("MARKER_SERVERLESS_URL_TTL_SECONDS", 3_600);
}
