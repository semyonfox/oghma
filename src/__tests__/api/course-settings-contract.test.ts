import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/courses/settings/route";
import { PATCH } from "@/app/api/courses/settings/[courseId]/route";

const COURSE_ID = "9007199254740993";

function request(path: string, body: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function expectTraced400(responsePromise: Promise<Response>) {
  const response = await responsePromise;
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.any(String),
    traceId: expect.stringMatching(/^(?!no-trace$).+/),
  });
  expect(mocks.sql).not.toHaveBeenCalled();
}

describe("course settings request contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({
      user_id: "123e4567-e89b-42d3-a456-426614174000",
      email: "user@example.com",
    });
  });

  it.each([
    ["malformed JSON", "{"],
    ["null JSON", "null"],
    [
      "a non-string course name",
      JSON.stringify({ canvasCourseId: COURSE_ID, courseName: 42 }),
    ],
    [
      "a non-boolean active flag",
      JSON.stringify({
        canvasCourseId: COURSE_ID,
        courseName: "Algorithms",
        isActive: "false",
      }),
    ],
  ])("POST returns a traced 400 for %s", async (_label, body) => {
    await expectTraced400(POST(request("/api/courses/settings", body)));
  });

  it.each([
    ["malformed JSON", "{"],
    ["null JSON", "null"],
    ["a missing active flag", JSON.stringify({})],
    ["a non-boolean active flag", JSON.stringify({ isActive: 1 })],
  ])("PATCH returns a traced 400 for %s", async (_label, body) => {
    await expectTraced400(
      PATCH(request(`/api/courses/settings/${COURSE_ID}`, body), {
        params: Promise.resolve({ courseId: COURSE_ID }),
      }),
    );
  });
});
