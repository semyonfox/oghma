import { afterEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({
  provider: "cloudflare" as "cloudflare" | "bullmq",
  pull: vi.fn(),
  ack: vi.fn(),
  workers: [] as import("node:events").EventEmitter[],
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/queue", async (original) => ({
  ...await original<typeof import("@/lib/queue")>(),
  getQueueProvider: () => queue.provider,
  getQueueConnection: () => ({}),
  pullCloudflareQueueMessages: queue.pull,
  ackCloudflareQueueMessages: queue.ack,
}));
vi.mock("bullmq", async (original) => {
  const { EventEmitter } = await import("node:events");
  class Worker extends EventEmitter {
    constructor(readonly name: string) {
      super();
      queue.workers.push(this);
    }
    isRunning() { return true; }
    async close() {}
  }
  return { ...await original<typeof import("bullmq")>(), Worker };
});

import logger from "@/lib/logger";
import { processCloudflareQueueBatch, startQueueConsumers } from "@/lib/worker/consumers";

function message(id: string, body: Record<string, unknown>) {
  return { id, lease_id: `lease-${id}`, attempts: 2, body };
}

describe("Cloudflare queue consumer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges handled messages and delays a failed one for redelivery", async () => {
    queue.pull.mockResolvedValue({
      messages: [
        message("ok", { type: "canvas-file", importRecordId: "import-1" }),
        message("bad", { type: "canvas-file", importRecordId: "import-2" }),
      ],
    });
    const processJob = vi.fn(async (job: { id?: string }) => {
      if (job.id === "bad") throw new Error("handler failed");
    });

    await expect(processCloudflareQueueBatch("canvas", 10, processJob)).resolves.toBe(true);

    expect(processJob).toHaveBeenCalledWith(expect.objectContaining({
      id: "ok", name: "canvas-file", attemptsMade: 1,
    }));
    expect(queue.ack).toHaveBeenCalledWith(
      "canvas",
      ["lease-ok"],
      [{ lease_id: "lease-bad", delay_seconds: 60 }],
    );
  });

  it("finishes and acknowledges the batch in flight before close resolves", async () => {
    let release: () => void = () => undefined;
    queue.pull
      .mockResolvedValueOnce({ messages: [message("slow", { type: "canvas-file" })] })
      .mockResolvedValue({ messages: [] });
    const processJob = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const consumers = await startQueueConsumers({
      processJob,
      processChatGeneration: vi.fn(),
      jobConcurrency: 1,
      chatConcurrency: 1,
      markerDispatch: { enabled: false, concurrency: 1 },
    });
    await vi.waitFor(() => expect(processJob).toHaveBeenCalled());

    const closed = consumers.close();
    expect(consumers.isRunning()).toBe(false);
    release();
    await closed;

    // without the drain this lease would stay invisible for the whole
    // visibility timeout after a deploy
    expect(queue.ack).toHaveBeenCalledWith(expect.any(String), ["lease-slow"], []);
  });
});

describe("BullMQ consumer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    queue.provider = "cloudflare";
    queue.workers.length = 0;
  });

  it("reports a Redis fault BullMQ retries in a tight loop once a minute per queue", async () => {
    vi.useFakeTimers();
    queue.provider = "bullmq";
    await startQueueConsumers({
      processJob: vi.fn(),
      processChatGeneration: vi.fn(),
      jobConcurrency: 1,
      chatConcurrency: 1,
      markerDispatch: { enabled: false, concurrency: 1 },
    });
    // a full disk made Redis reject every fetch script with MISCONF and
    // BullMQ refetched without waiting, about 600 errors a second per queue
    const reply = new Error("MISCONF Redis is unable to persist to disk");
    for (const worker of queue.workers) {
      for (let i = 0; i < 600; i++) worker.emit("error", reply);
    }
    expect(logger.error).toHaveBeenCalledTimes(queue.workers.length);

    vi.advanceTimersByTime(60_000);
    queue.workers[0].emit("error", reply);
    expect(logger.error).toHaveBeenCalledTimes(queue.workers.length + 1);
  });
});
