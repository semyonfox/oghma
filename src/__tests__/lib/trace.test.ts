import { describe, expect, it } from "vitest";
import { generateTraceId, getTraceId, withTrace } from "@/lib/trace";

describe("trace utils", () => {
  it("generates short hex trace ids", () => {
    const traceId = generateTraceId();
    expect(traceId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("returns no-trace when no context is active", () => {
    expect(getTraceId()).toBe("no-trace");
  });

  it("keeps the same trace id across async boundaries", async () => {
    await withTrace(async () => {
      const beforeAwait = getTraceId();
      await Promise.resolve();
      const afterAwait = getTraceId();

      expect(beforeAwait).not.toBe("no-trace");
      expect(afterAwait).toBe(beforeAwait);
    });
  });

  it("isolates nested traces and restores outer context", async () => {
    await withTrace(async () => {
      const outerTrace = getTraceId();

      await withTrace(async () => {
        const innerTrace = getTraceId();
        expect(innerTrace).not.toBe(outerTrace);
      });

      expect(getTraceId()).toBe(outerTrace);
    });
  });
});
