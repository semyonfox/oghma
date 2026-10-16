import { afterEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({
  pull: vi.fn(),
  ack: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/queue", async (original) => ({
  ...await original<typeof import("@/lib/queue")>(),
  getQueueProvider: () => "cloudflare",
  pullCloudflareQueueMessages: queue.pull,
  ackCloudflareQueueMessages: queue.ack,
}));

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
