import { afterEach, describe, expect, it, vi } from "vitest";

const queueAdd = vi.hoisted(() => vi.fn());
const queueConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(function QueueMock() {
    return {
      add: queueAdd,
      addBulk: vi.fn(),
    };
  }),
);

const redisConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(function RedisMock() {
    return {
      disconnect: vi.fn(),
    };
  }),
);

vi.mock("bullmq", () => ({
  Queue: queueConstructor,
}));

vi.mock("ioredis", () => ({
  default: redisConstructor,
}));

describe("BullMQ queue prefixing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    queueConstructor.mockClear();
    queueAdd.mockClear();
    redisConstructor.mockClear();
  });

  it("puts delayed extraction retries on the shared Canvas queue", async () => {
    vi.stubEnv("QUEUE_PREFIX", "oghma-dev");

    const { enqueueExtractRetryJob } = await import("@/lib/queue");
    await enqueueExtractRetryJob({ noteId: "note-1" }, 120);

    expect(queueConstructor).toHaveBeenCalledTimes(1);
    expect(queueConstructor).toHaveBeenCalledWith(
      "oghma-dev-canvas-import",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "extract-retry",
      { type: "extract-retry", noteId: "note-1" },
      expect.objectContaining({ delay: 120_000 }),
    );
  });

  it("uses QUEUE_PREFIX in the queue names shared by producers and workers", async () => {
    vi.stubEnv("QUEUE_PREFIX", "oghma-dev");

    const {
      CANVAS_IMPORT_QUEUE,
      EXTRACT_RETRY_QUEUE,
      CHAT_GENERATION_QUEUE,
      MARKER_DISPATCH_QUEUE,
      getCanvasImportQueue,
      getChatGenerationQueue,
      getExtractRetryQueue,
      getMarkerDispatchQueue,
    } = await import("@/lib/queue");

    expect(CANVAS_IMPORT_QUEUE).toBe("oghma-dev-canvas-import");
    expect(EXTRACT_RETRY_QUEUE).toBe("oghma-dev-extract-retry");
    expect(CHAT_GENERATION_QUEUE).toBe("oghma-dev-chat-generation");
    expect(MARKER_DISPATCH_QUEUE).toBe("oghma-dev-marker-dispatch");

    getCanvasImportQueue();
    getExtractRetryQueue();
    getChatGenerationQueue();
    getMarkerDispatchQueue();

    expect(queueConstructor).toHaveBeenNthCalledWith(
      1,
      "oghma-dev-canvas-import",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(queueConstructor).toHaveBeenNthCalledWith(
      3,
      "oghma-dev-chat-generation",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(queueConstructor).toHaveBeenNthCalledWith(
      2,
      "oghma-dev-extract-retry",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(queueConstructor).toHaveBeenNthCalledWith(
      4,
      "oghma-dev-marker-dispatch",
      expect.objectContaining({ connection: expect.anything() }),
    );
  });

  it("queues one application-originated Marker dispatch and leaves recovery to the DB", async () => {
    vi.stubEnv("QUEUE_PREFIX", "oghma-dev");

    const { enqueueMarkerDispatchJob } = await import("@/lib/queue");
    await enqueueMarkerDispatchJob("callback-1");

    expect(queueConstructor).toHaveBeenCalledWith(
      "oghma-dev-marker-dispatch",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "marker-dispatch",
      { type: "marker-dispatch", callbackId: "callback-1" },
      expect.objectContaining({
        jobId: "marker-dispatch-callback-1",
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
  });

  it("uses a deterministic, removable continuation job for Marker completion", async () => {
    vi.stubEnv("QUEUE_PREFIX", "oghma-dev");

    const { enqueueMarkerCompletionJob } = await import("@/lib/queue");
    await enqueueMarkerCompletionJob("callback-1");

    expect(queueAdd).toHaveBeenCalledWith(
      "marker-complete",
      { type: "marker-complete", markerJobId: "callback-1" },
      expect.objectContaining({
        jobId: "marker-complete-callback-1",
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
  });

  it("can infer distinct prefixes from app URLs when no explicit queue prefix is set", async () => {
    vi.stubEnv("QUEUE_PREFIX", "");
    vi.stubEnv("BULLMQ_QUEUE_PREFIX", "");
    vi.stubEnv("DEPLOY_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dev.oghmanotes.ie");

    const { CANVAS_IMPORT_QUEUE, EXTRACT_RETRY_QUEUE } = await import("@/lib/queue");

    expect(CANVAS_IMPORT_QUEUE).toBe("dev-oghmanotes-ie-canvas-import");
    expect(EXTRACT_RETRY_QUEUE).toBe("dev-oghmanotes-ie-extract-retry");
  });
});
