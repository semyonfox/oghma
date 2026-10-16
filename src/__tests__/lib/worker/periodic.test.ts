import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import logger from "@/lib/logger";
import { startPeriodicTask } from "@/lib/worker/periodic";

describe("worker periodic tasks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips ticks while a slow run is still in flight", async () => {
    let release: () => void = () => undefined;
    const work = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const task = startPeriodicTask("slow", work, 1_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(work).toHaveBeenCalledTimes(1);

    release();
    await task.idle();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(work).toHaveBeenCalledTimes(2);
    task.stop();
  });

  it("contains a failing run so the process keeps going and the next tick retries", async () => {
    const work = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(undefined);
    const task = startPeriodicTask("flaky", work, 1_000, { runNow: true });

    await task.idle();
    expect(logger.error).toHaveBeenCalledWith(
      "worker periodic task failed",
      expect.objectContaining({ task: "flaky" }),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(work).toHaveBeenCalledTimes(2);
    task.stop();
  });

  it("starts no new runs after stop", async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    const task = startPeriodicTask("stopped", work, 1_000);
    task.stop();

    await vi.advanceTimersByTimeAsync(5_000);
    await task.trigger();
    expect(work).not.toHaveBeenCalled();
  });
});
