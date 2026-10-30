import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import {
  errorTags,
  monitoringPath,
  privateDataCollection,
  sanitizeError,
  sanitizeSpan,
} from "@/lib/monitoring/privacy";
import { traceSampleRate } from "@/lib/monitoring/options";

describe("monitoring privacy", () => {
  it("keeps route structure without note IDs, share tokens, queries or fragments", () => {
    expect(
      monitoringPath(
        "https://oghmanotes.ie/api/notes/private-note?token=secret#content",
      ),
    ).toBe("/api/notes/[id]");
    expect(monitoringPath("/api/calendar/ical/private-feed-token")).toBe(
      "/api/calendar/ical/[id]",
    );
  });

  it("keeps stack locations and trace correlation while dropping private error context", () => {
    const result = sanitizeError({
      type: undefined,
      event_id: "event",
      release: "commit",
      environment: "test",
      user: { email: "private@example.test" },
      message: "private note",
      extra: { note: "private note" },
      breadcrumbs: [{ message: "private note" }],
      request: {
        url: "/api/notes/private-id?token=private",
        data: "private note",
        headers: { Authorization: "private" },
      },
      exception: {
        values: [
          {
            type: "TypeError",
            value: "private note",
            stacktrace: {
              frames: [
                {
                  filename: "src/lib/study-map/jobs.ts",
                  function: "publishJob",
                  lineno: 40,
                  colno: 2,
                  vars: { note: "private" },
                  context_line: "private",
                },
              ],
            },
          },
        ],
      },
      contexts: {
        trace: {
          trace_id: "trace",
          span_id: "span",
          data: { note: "private" },
        },
      },
      tags: { service: "worker", operation: "study.classify", task: "study map reconciliation", errorCode: "25P03", logMessage: "worker periodic task failed", note: "private", stage: "private Notes.pdf" },
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.user).toEqual({ ip_address: "0.0.0.0" });
    expect(result.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject(
      {
        filename: "src/lib/study-map/jobs.ts",
        function: "publishJob",
        lineno: 40,
      },
    );
    expect(result.contexts?.trace?.trace_id).toBe("trace");
    expect(result.tags).toEqual({
      service: "worker",
      operation: "study.classify",
      task: "study map reconciliation",
      errorCode: "25P03",
      logMessage: "worker periodic task failed",
    });
  });

  it("tags untagged library and uncaught errors with their code and Redis command", () => {
    // ioredis replies carry the rejected command and its private arguments, and no code
    const reply = Object.assign(
      new Error("MISCONF Redis is unable to persist to disk, script: private-key"),
      { name: "ReplyError", command: { name: "evalsha", args: ["private-key", "private note"] } },
    );
    const event = {
      type: undefined,
      exception: { values: [{ type: "ReplyError", value: reply.message }] },
      tags: { service: "worker" },
    } satisfies ErrorEvent;
    const result = sanitizeError(event, { originalException: reply });
    expect(result.tags).toEqual({ service: "worker", errorCode: "MISCONF", redisCommand: "evalsha" });
    expect(JSON.stringify(result)).not.toContain("private");

    const disk = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
    expect(sanitizeError({ type: undefined, level: "fatal" }, { originalException: disk }).tags).toEqual({ errorCode: "ENOSPC" });
    // the leading word of an ordinary message may be user content
    expect(errorTags(new Error("JANE uploaded private.pdf"))).toEqual({});
  });

  it("keeps duration and status without SQL, payloads, URLs or span links", () => {
    const result = sanitizeSpan({
      trace_id: "trace",
      span_id: "span",
      name: "SELECT private FROM notes",
      status: "error",
      is_segment: false,
      start_timestamp: 1,
      end_timestamp: 3,
      attributes: {
        "sentry.op": "db.query",
        "db.system": "postgresql",
        "db.query.text": "private",
        "gen_ai.input.messages": "private",
        "http.request.body": "private",
        "url.full": "https://private.example",
      },
      links: [{ trace_id: "private", span_id: "private" }],
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.name).toBe("db.query");
    expect(result.end_timestamp! - result.start_timestamp).toBe(2);
    expect(result.attributes["db.system"]).toBe("postgresql");
    expect(result.status).toBe("error");
  });

  it("removes request content and AI inputs at collection time", () => {
    expect(privateDataCollection.httpBodies).toEqual([]);
    expect(privateDataCollection.genAI).toEqual({
      inputs: false,
      outputs: false,
    });
    expect(privateDataCollection.queues).toBe(false);
    expect(privateDataCollection.databaseQueryData).toBe(false);
  });

  it.each(["0", "0.1", "1"])("accepts trace sample rate %s", (value) => {
    expect(traceSampleRate(value)).toBe(Number(value));
  });
  it.each(["-1", "2", "NaN", " ", ""])(
    "bounds invalid trace sample rate %s",
    (value) => {
      expect(traceSampleRate(value)).toBe(0.1);
    },
  );
});
