import { describe, expect, it, vi } from "vitest";
import {
  createAsyncLimiter,
  pooled,
} from "@/lib/canvas/async-limiter";

describe("Canvas async limiter", () => {
  it("never runs more than the configured number of tasks", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const limit = createAsyncLimiter(2);

    const tasks = Array.from({ length: 4 }, (_, index) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return index;
      }),
    );

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0, 2).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0, 2).forEach((release) => release());

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("keeps task failures in input order without rejecting the pool", async () => {
    const failure = new Error("broken task");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      pooled(
        [
          async () => "first",
          async () => {
            throw failure;
          },
          async () => "third",
        ],
        2,
      ),
    ).resolves.toEqual([
      { status: "fulfilled", value: "first" },
      { status: "rejected", reason: failure },
      { status: "fulfilled", value: "third" },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "[pooled] task rejected:",
      failure,
    );
    consoleError.mockRestore();
  });

  it("rejects invalid limits instead of leaving queued tasks unresolved", () => {
    expect(() => createAsyncLimiter(0)).toThrow(RangeError);
    expect(() => createAsyncLimiter(1.5)).toThrow(RangeError);
  });
});
