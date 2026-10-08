import * as Sentry from "@sentry/node";
import type { Envelope } from "@sentry/core";
import { afterEach, describe, expect, it } from "vitest";
import { monitorOperation } from "@/lib/monitoring/operations";
import { monitoringOptions } from "@/lib/monitoring/options";
import logger from "@/lib/logger";

afterEach(async () => {
  await Sentry.close(1000);
});

describe("monitored worker operations", () => {
  it("reports a caught failure without changing the thrown error or leaking content", async () => {
    const envelopes: Envelope[] = [];
    Sentry.init({
      ...monitoringOptions("worker"),
      dsn: "https://public@example.invalid/1",
      defaultIntegrations: false,
      tracesSampleRate: 1,
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    const failure = new TypeError("private document content");
    await expect(
      monitorOperation("study.classify", async () => {
        logger.error("operation failed", { error: failure });
        throw failure;
      }),
    ).rejects.toBe(failure);
    await Sentry.flush(1000);
    const items: Array<[{ type: string }, unknown]> = [];
    for (const envelope of envelopes)
      for (const item of envelope[1]) items.push(item);
    const errors = items.filter(([header]) => header.type === "event");
    expect(errors).toHaveLength(1);
    expect(errors[0][1]).toMatchObject({
      tags: { service: "worker", operation: "study.classify" },
      exception: {
        values: [
          expect.objectContaining({
            type: "TypeError",
            stacktrace: {
              frames: expect.arrayContaining([
                expect.objectContaining({
                  filename: expect.stringContaining(
                    "monitoring-operations.test.ts",
                  ),
                }),
              ]),
            },
          }),
        ],
      },
    });
    expect(JSON.stringify(envelopes)).not.toContain("private document content");
    const spans = items.filter(([header]) => header.type === "span");
    expect(spans.map(([, payload]) => payload)).toContainEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ name: "study.classify", status: "error" }),
        ]),
      }),
    );
  });

  it("returns successful results with monitoring disabled", async () => {
    await expect(
      monitorOperation("worker.canvas", async () => "complete"),
    ).resolves.toBe("complete");
  });
});
