import { describe, it, expect, vi } from "vitest";
import winston from "winston";
import { PassThrough } from "node:stream";
import logger, { redactSensitive } from "@/lib/logger";
vi.mock("winston-daily-rotate-file", () => ({ default: vi.fn() }));

describe("operational diagnostics privacy", () => {
  it("drops text, stacks, identifiers, symbols and arbitrary nested fields", () => {
    const result = redactSensitive.transform({
      level: "error", message: "private note student@example.test /notes/private-id", statusCode: 503,
      userId: "private-id", emailHash: "identity-hash", traceId: "trace-id", stack: "private stack", internal: "secret token",
      user: { name: "private name", email: "private@example.test" },
      [Symbol.for("splat")]: ["private interpolation"], [Symbol.for("message")]: "private cached serialization",
    });
    expect(result).toEqual({ level: "error", [Symbol.for("level")]: "error", message: "operation_failed", service: "oghmanotes", statusClass: "5xx" });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|trace|hash|email|stack/);
  });
  it("keeps the duplicate-account security category without identity", () => {
    const result = redactSensitive.transform({ level: "error", message: "private identity", category: "duplicate_account_detected", user_ids: ["private-user"], emailHash: "private-hash" });
    expect(result).toMatchObject({ message: "duplicate_account_detected" });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("sanitizes actual transport output instead of only metadata helpers", async () => {
    const stream = new PassThrough(); let output = "";
    stream.on("data", (data: Buffer) => { output += data.toString(); });
    const transport = new winston.transports.Stream({ stream, format: winston.format.json() });
    logger.add(transport);
    logger.error("private fixture email@example.test", { error: new Error("private note"), user_ids: ["private-id"], [Symbol.for("splat")]: ["secret"] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    logger.remove(transport); stream.end();
    expect(output).toContain("operation_failed"); expect(output).not.toMatch(/private|secret|email|user_ids|traceId|timestamp|stack/);
  });
});
