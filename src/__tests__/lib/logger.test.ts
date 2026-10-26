import { describe, it, expect, vi } from "vitest";
import winston from "winston";
import { PassThrough } from "node:stream";
import { captureException } from "@sentry/core";
import logger, { redactSensitive } from "@/lib/logger";
vi.mock("winston-daily-rotate-file", () => ({ default: vi.fn() }));
vi.mock("@sentry/core", () => ({ captureException: vi.fn() }));

async function logged(write: () => void): Promise<Record<string, unknown>> {
  const stream = new PassThrough(); let output = "";
  stream.on("data", (data: Buffer) => { output += data.toString(); });
  const transport = new winston.transports.Stream({ stream, format: winston.format.json() });
  logger.add(transport);
  write();
  await new Promise<void>((resolve) => setImmediate(resolve));
  logger.remove(transport); stream.end();
  return JSON.parse(output);
}

class PostgresError extends Error {
  code = "25P03";
}

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
  it("keeps the fixed message, task and error class and code so a failure can be traced", async () => {
    const error = new PostgresError("terminating connection for student@example.test");
    const output = await logged(() => logger.error("worker periodic task failed", { task: "study map reconciliation", error, durationMs: 31_250.4, statusCode: 500 }));
    expect(output).toEqual({
      level: "error", message: "worker periodic task failed", service: "oghmanotes", task: "study map reconciliation",
      errorType: "PostgresError", errorCode: "25P03", durationMs: 31_250, statusClass: "5xx",
    });
    expect(captureException).toHaveBeenLastCalledWith(error, {
      tags: { task: "study map reconciliation", errorCode: "25P03", logMessage: "worker periodic task failed" },
    });
  });
  it("strips a positional error's text from the message and still reports the real exception", async () => {
    const error = Object.assign(new Error("private note body"), { code: "ECONNRESET" });
    const output = await logged(() => logger.error("cache set failed", error));
    expect(output).toMatchObject({ message: "cache set failed", errorType: "Error", errorCode: "ECONNRESET" });
    expect(JSON.stringify(output)).not.toContain("private");
    expect(captureException).toHaveBeenLastCalledWith(error, expect.anything());
  });
  it("drops names and codes that could carry user content", () => {
    const result = redactSensitive.transform({
      level: "warn", message: "Lecture 3 notes.pdf for jane@example.test", task: "Jane's Notes.pdf", stage: "x".repeat(81),
      code: "private code with spaces", durationMs: Number.NaN,
    });
    expect(result).toEqual({ level: "warn", [Symbol.for("level")]: "warn", message: "operation_warning", service: "oghmanotes" });
  });
});
