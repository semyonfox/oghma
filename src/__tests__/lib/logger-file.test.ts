import { describe, expect, it, vi } from "vitest";
import { captureException } from "@sentry/core";

vi.mock("@sentry/core", () => ({ captureException: vi.fn() }));
// stands in for the rotating file transport, which writes through a public
// logStream and never listens for that stream's errors
vi.mock("winston-daily-rotate-file", async () => {
  const winston = (await import("winston")).default;
  const Transport = (await import("winston-transport")).default;
  const { PassThrough } = await import("node:stream");
  class DailyRotateFile extends Transport {
    logStream = new PassThrough();
    log(_info: unknown, next: () => void) {
      next();
    }
  }
  Object.assign(winston.transports, { DailyRotateFile });
  return { default: DailyRotateFile };
});

describe("production log file", () => {
  it("drops the file copy instead of crashing when the disk is full", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const logger = (await import("@/lib/logger")).default;
    const { default: DailyRotateFile } = await import("winston-daily-rotate-file");
    const file = logger.transports.find((transport) => transport instanceof DailyRotateFile);
    if (!(file instanceof DailyRotateFile)) throw new Error("file transport missing");
    const full = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });

    // an 'error' event with no listener throws here, which killed the worker
    file.logStream.emit("error", full);
    file.logStream.emit("error", full);

    expect(logger.transports).not.toContain(file);
    expect(logger.transports).toHaveLength(1);
    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(full, { tags: { errorCode: "ENOSPC" } });
    vi.unstubAllEnvs();
  });
});
