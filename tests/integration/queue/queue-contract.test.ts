import { afterAll, describe, expect, it } from "vitest";
import {
  CANVAS_IMPORT_QUEUE,
  enqueueCanvasJob,
  getCanvasImportQueue,
  getQueueConnection,
} from "@/lib/queue";

describe("BullMQ queue contract", () => {
  afterAll(async () => {
    await getCanvasImportQueue().close();
    getQueueConnection().disconnect();
  });

  it("enqueues deterministic canvas-import work", async () => {
    const queue = getCanvasImportQueue();
    await queue.drain(true);

    await enqueueCanvasJob("e2e-contract", { jobId: "job-1", userId: "user-1" }, { attempts: 1 });

    const waiting = await queue.getWaiting();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].queueName).toBe(CANVAS_IMPORT_QUEUE);
    expect(waiting[0].name).toBe("e2e-contract");
    expect(waiting[0].data).toMatchObject({
      type: "e2e-contract",
      jobId: "job-1",
      userId: "user-1",
    });
  });
});

