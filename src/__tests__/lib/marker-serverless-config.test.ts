import { afterEach, describe, expect, it } from "vitest";

import {
  markerQueueEnabled,
  markerServerlessProvider,
} from "@/lib/marker-serverless";

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

  it("fails closed for retired RunPod configuration", () => {
    process.env.MARKER_OCR_ENABLED = "true";
    process.env.STORAGE_PUBLIC_ENDPOINT = "https://objects.example";
    process.env.RUNPOD_MARKER_ENDPOINT_ID = "endpoint";
    process.env.RUNPOD_API_KEY = "key";
    process.env.RUNPOD_MARKER_WEBHOOK_TOKEN = "token";
    process.env.RUNPOD_MARKER_WEBHOOK_BASE_URL = "https://app.example";

    expect(markerServerlessProvider()).toBeNull();
    expect(markerQueueEnabled()).toBe(false);
  });
});
