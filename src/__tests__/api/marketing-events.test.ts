import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), {
    json: vi.fn((value: unknown) => value),
  }),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/api-error", () => ({
  withErrorHandler:
    (handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request),
}));

import { POST } from "@/app/api/marketing/events/route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/marketing/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/marketing/events privacy boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockResolvedValue([]);
  });

  it.each([
    ["Do Not Track", { DNT: "1" }],
    ["legacy Do Not Track", { DNT: "YES" }],
    ["Global Privacy Control", { "Sec-GPC": "1" }],
  ])("accepts %s opt-out without writing an event", async (_name, headers) => {
    const response = await POST(
      request({ eventName: "page_view", path: "/pricing" }, headers),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("drops untrusted identity, private location, and free-form PII before storage", async () => {
    const privateValues = [
      "11111111-1111-4111-8111-111111111111",
      "/notes/private-note-id?token=secret",
      "https://mail.example/student@example.com",
      "student@example.com",
      "https://oghmanotes.ie/settings?token=secret",
      "private medical note",
      "/canvas/private-canvas-id",
      "private-medical-condition",
    ];
    const response = await POST(
      request({
        eventName: "page_view",
        userId: privateValues[0],
        path: privateValues[1],
        referrer: privateValues[2],
        source: privateValues[3],
        targetUrl: privateValues[4],
        fromPath: privateValues[6],
        toPath: privateValues[1],
        pathChain: ["/", privateValues[6]],
        attributionPath: privateValues[6],
        utm: {
          source: privateValues[3],
          campaign: privateValues[7],
        },
        properties: {
          email: privateValues[3],
          message: privateValues[5],
        },
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.sql).toHaveBeenCalledOnce();
    const storedValues = mocks.sql.mock.calls[0].slice(1);
    expect(storedValues.slice(0, 6)).toEqual([
      "page_view",
      null,
      null,
      null,
      null,
      null,
    ]);
    const serializedValues = JSON.stringify(storedValues);
    for (const privateValue of privateValues) {
      expect(serializedValues).not.toContain(privateValue);
    }
  });
});
