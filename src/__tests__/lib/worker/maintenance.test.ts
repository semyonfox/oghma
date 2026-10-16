import { describe, expect, it, vi } from "vitest";
import { drainStudyJobs, pruneInBatches } from "@/lib/worker/maintenance";

describe("drainStudyJobs", () => {
  it("keeps taking jobs within one tick until the queue is empty", async () => {
    const queue = [true, true, true, false];
    const processNext = vi.fn(async () => queue.shift() ?? false);
    await expect(drainStudyJobs(processNext, () => false)).resolves.toBe(3);
    expect(processNext).toHaveBeenCalledTimes(4);
  });

  it("starts no new job once the tick's budget is spent", async () => {
    let clock = 0;
    const processNext = vi.fn(async () => {
      clock += 1_500;
      return true;
    });
    await expect(drainStudyJobs(processNext, () => false, 4_000, () => clock)).resolves.toBe(3);
  });

  it("stops between jobs when the worker starts shutting down", async () => {
    let stopping = false;
    const processNext = vi.fn(async () => {
      stopping = true;
      return true;
    });
    await expect(drainStudyJobs(processNext, () => stopping)).resolves.toBe(1);
    expect(processNext).toHaveBeenCalledTimes(1);
  });
});

describe("pruneInBatches", () => {
  it("keeps pruning until a batch comes back empty", async () => {
    const batches = [500, 500, 120, 0];
    const prune = vi.fn(async () => batches.shift() ?? 0);
    await expect(pruneInBatches(prune)).resolves.toBe(1_120);
    expect(prune).toHaveBeenCalledTimes(4);
  });

  it("caps the work one daily pass can do", async () => {
    const prune = vi.fn(async () => 500);
    await expect(pruneInBatches(prune, 3)).resolves.toBe(1_500);
    expect(prune).toHaveBeenCalledTimes(3);
  });
});
