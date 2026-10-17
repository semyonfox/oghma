import { AsyncLocalStorage } from "node:async_hooks";
import logger from "@/lib/logger";
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

  it("runs a queued task in its caller's async context, not the releasing task's", async () => {
    // a queued Canvas file import that inherited another file's execution
    // owner failed its claim check and was left stuck in downloading
    const owner = new AsyncLocalStorage<string>();
    const limit = createAsyncLimiter(1);
    let release!: () => void;

    const first = owner.run("first", () =>
      limit(async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return owner.getStore();
      }),
    );
    const second = owner.run("second", () =>
      limit(async () => owner.getStore()),
    );

    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    owner.run("first", () => release());

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
  });

  it("keeps task failures in input order without rejecting the pool", async () => {
    const failure = new Error("broken task");
    const consoleError = vi.spyOn(logger, "error").mockImplementation(() => logger);

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
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("broken task");
    expect(consoleError.mock.calls[0]).toHaveLength(1);
    consoleError.mockRestore();
  });

  it("rejects invalid limits instead of leaving queued tasks unresolved", () => {
    expect(() => createAsyncLimiter(0)).toThrow(RangeError);
    expect(() => createAsyncLimiter(1.5)).toThrow(RangeError);
  });
});
