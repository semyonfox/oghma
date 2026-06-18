import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueCanvasJob,
  enqueueExtractRetryJob,
  parseCloudflareQueueBody,
} from "@/lib/queue";

function setCloudflareQueueEnv() {
  process.env.QUEUE_PROVIDER = "cloudflare";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-1";
  process.env.CLOUDFLARE_QUEUES_API_TOKEN = "queue-token";
  process.env.CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID = "canvas-queue-id";
  process.env.CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID = "retry-queue-id";
}

describe("Cloudflare queue adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QUEUE_PROVIDER;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_QUEUES_API_TOKEN;
    delete process.env.CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID;
    delete process.env.CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID;
  });

  it("publishes canvas jobs with the existing message envelope", async () => {
    setCloudflareQueueEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await enqueueCanvasJob("canvas-discover", { jobId: "job-1", userId: "user-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-1/queues/canvas-queue-id/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          body: { type: "canvas-discover", jobId: "job-1", userId: "user-1" },
          contentType: "json",
        }),
      }),
    );
  });

  it("publishes delayed extraction retries to the retry queue", async () => {
    setCloudflareQueueEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await enqueueExtractRetryJob({ noteId: "note-1" }, 120);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-1/queues/retry-queue-id/messages",
      expect.objectContaining({
        body: JSON.stringify({
          body: { type: "extract-retry", noteId: "note-1" },
          contentType: "json",
          delaySeconds: 120,
        }),
      }),
    );
  });

  it("decodes base64 JSON bodies returned by HTTP pull", () => {
    const body = Buffer.from(JSON.stringify({ type: "extract", noteId: "note-1" })).toString("base64");

    expect(
      parseCloudflareQueueBody({
        id: "msg-1",
        lease_id: "lease-1",
        attempts: 1,
        body,
        metadata: { "CF-Content-Type": "json" },
      }),
    ).toEqual({ type: "extract", noteId: "note-1" });
  });
});
