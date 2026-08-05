import { afterEach, describe, expect, it } from "vitest";

import {
  validateMarkerWorkerConfiguration,
} from "@/lib/marker-worker-config";

const variables = [
  "MARKER_API_URL",
  "MARKER_OCR_ENABLED",
  "MARKER_SERVERLESS_PROVIDER",
  "MARKER_SERVERLESS_DISPATCH_ENABLED",
  "MARKER_DISPATCH_CONSUMER_ENABLED",
  "STORAGE_PUBLIC_ENDPOINT",
  "VAST_MARKER_ENDPOINT_NAME",
  "VAST_MARKER_ENDPOINT_API_KEY",
  "RUNPOD_MARKER_ENDPOINT_ID",
  "RUNPOD_API_KEY",
  "RUNPOD_MARKER_WEBHOOK_TOKEN",
  "RUNPOD_MARKER_WEBHOOK_BASE_URL",
];

function configureRunPod() {
  process.env.MARKER_SERVERLESS_PROVIDER = "runpod";
  process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
  process.env.RUNPOD_MARKER_ENDPOINT_ID = "endpoint";
  process.env.RUNPOD_API_KEY = "key";
  process.env.RUNPOD_MARKER_WEBHOOK_TOKEN = "token";
  process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL = "https://app.example";
}

describe("Marker worker configuration", () => {
  afterEach(() => {
    for (const variable of variables) delete process.env[variable];
  });

  it("keeps a configured but disabled RunPod provider deploy-valid", () => {
    configureRunPod();
    process.env.MARKER_OCR_ENABLED = "false";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "false";

    expect(validateMarkerWorkerConfiguration()).toEqual({
      markerDispatchConsumerEnabled: true,
    });
  });

  it("accepts a complete enabled RunPod route with its consumer", () => {
    configureRunPod();
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";

    expect(validateMarkerWorkerConfiguration()).toEqual({
      markerDispatchConsumerEnabled: true,
    });
  });

  it("rejects an enabled RunPod route with an incomplete configuration", () => {
    process.env.MARKER_SERVERLESS_PROVIDER = "runpod";
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";

    expect(() => validateMarkerWorkerConfiguration()).toThrow(
      /MARKER_SERVERLESS_DISPATCH_ENABLED=true requires a configured provider/,
    );
  });

  it("rejects enabled serverless dispatch when its consumer is disabled", () => {
    configureRunPod();
    process.env.MARKER_SERVERLESS_DISPATCH_ENABLED = "true";
    process.env.MARKER_DISPATCH_CONSUMER_ENABLED = "false";

    expect(() => validateMarkerWorkerConfiguration()).toThrow(
      /MARKER_DISPATCH_CONSUMER_ENABLED=true/,
    );
  });

  it("rejects an unknown serverless provider instead of falling back", () => {
    process.env.MARKER_SERVERLESS_PROVIDER = "other";

    expect(() => validateMarkerWorkerConfiguration()).toThrow(
      /must be vast or runpod/,
    );
  });

  it("rejects a mixed direct and serverless Marker configuration", () => {
    configureRunPod();
    process.env.MARKER_API_URL = "http://marker.internal";

    expect(() => validateMarkerWorkerConfiguration()).toThrow(
      /cannot be combined with MARKER_API_URL/,
    );
  });

  it("accepts direct Marker only when no serverless provider is selected", () => {
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.MARKER_API_URL = "http://marker.internal";
    process.env.MARKER_DISPATCH_CONSUMER_ENABLED = "false";

    expect(validateMarkerWorkerConfiguration()).toEqual({
      markerDispatchConsumerEnabled: false,
    });
  });
});
