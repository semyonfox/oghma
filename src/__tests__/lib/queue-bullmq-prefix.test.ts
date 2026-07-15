import { afterEach, describe, expect, it, vi } from "vitest";

const queueConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(function QueueMock() {
    return {
      add: vi.fn(),
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
    redisConstructor.mockClear();
  });

  it("uses QUEUE_PREFIX in the queue names shared by producers and workers", async () => {
    vi.stubEnv("QUEUE_PREFIX", "oghma-dev");

    const {
      CANVAS_IMPORT_QUEUE,
      EXTRACT_RETRY_QUEUE,
      CHAT_GENERATION_QUEUE,
      getCanvasImportQueue,
      getChatGenerationQueue,
      getExtractRetryQueue,
    } = await import("@/lib/queue");

    expect(CANVAS_IMPORT_QUEUE).toBe("oghma-dev-canvas-import");
    expect(EXTRACT_RETRY_QUEUE).toBe("oghma-dev-extract-retry");
    expect(CHAT_GENERATION_QUEUE).toBe("oghma-dev-chat-generation");

    getCanvasImportQueue();
    getExtractRetryQueue();
    getChatGenerationQueue();

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
