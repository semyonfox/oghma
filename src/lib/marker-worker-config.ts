import {
  markerQueueEnabled,
  markerServerlessConfigured,
  markerServerlessProvider,
} from "@/lib/marker-serverless";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes(
    value?.trim().toLowerCase() ?? "",
  );
}

export function markerDispatchConsumerEnabled(): boolean {
  return !["0", "false", "no", "off"].includes(
    process.env.MARKER_DISPATCH_CONSUMER_ENABLED?.trim().toLowerCase() ?? "",
  );
}

export interface MarkerWorkerConfiguration {
  markerDispatchConsumerEnabled: boolean;
}

/**
 * Validate worker-side Marker routing without making a provider request.
 *
 * The dispatch kill switch deliberately protects recovery as well as new OCR
 * routing, so it must not be enabled if the worker would leave jobs unclaimed.
 */
export function validateMarkerWorkerConfiguration(): MarkerWorkerConfiguration {
  const rawProvider = process.env.MARKER_SERVERLESS_PROVIDER?.trim();
  const provider = markerServerlessProvider();
  const markerConsumerEnabled = markerDispatchConsumerEnabled();
  const directMarkerUrl = process.env.MARKER_API_URL?.trim();
  const serverlessDispatchEnabled = enabled(
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED,
  );
  const ocrEnabled = enabled(process.env.MARKER_OCR_ENABLED);

  if (rawProvider && !provider) {
    throw new Error(
      "MARKER_SERVERLESS_PROVIDER must be vast or runpod when configured",
    );
  }
  if (provider && directMarkerUrl) {
    throw new Error(
      "MARKER_SERVERLESS_PROVIDER cannot be combined with MARKER_API_URL",
    );
  }
  if (serverlessDispatchEnabled) {
    if (!provider || !markerServerlessConfigured()) {
      throw new Error(
        "MARKER_SERVERLESS_DISPATCH_ENABLED=true requires a configured provider, endpoint-scoped key, webhook configuration where required, and HTTPS STORAGE_PUBLIC_ENDPOINT",
      );
    }
    if (!markerConsumerEnabled) {
      throw new Error(
        "MARKER_SERVERLESS_DISPATCH_ENABLED=true requires MARKER_DISPATCH_CONSUMER_ENABLED=true",
      );
    }
  }
  if (ocrEnabled) {
    if (provider) {
      if (!markerQueueEnabled()) {
        throw new Error(
          `MARKER_OCR_ENABLED=true requires an explicitly enabled ${provider} dispatch, endpoint-scoped key, webhook configuration where required, and HTTPS STORAGE_PUBLIC_ENDPOINT`,
        );
      }
    } else if (!directMarkerUrl) {
      throw new Error(
        "MARKER_OCR_ENABLED=true requires MARKER_SERVERLESS_PROVIDER=vast or runpod, or MARKER_API_URL",
      );
    }
  }

  return { markerDispatchConsumerEnabled: markerConsumerEnabled };
}
