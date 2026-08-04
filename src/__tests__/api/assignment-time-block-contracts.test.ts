import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  validateSession: vi.fn(),
  queryResults: [] as unknown[][],
}));

vi.mock("@/database/pgsql.js", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  GET as getAssignments,
  POST as postAssignment,
} from "@/app/api/assignments/route";
import {
  GET as getAssignment,
  PATCH as patchAssignment,
} from "@/app/api/assignments/[id]/route";
import {
  GET as getTimeBlocks,
  POST as postTimeBlock,
} from "@/app/api/time-blocks/route";
import { PATCH as patchTimeBlock } from "@/app/api/time-blocks/[id]/route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const ITEM_ID = "123e4567-e89b-42d3-a456-426614174001";

function isTemplateStrings(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "raw");
}

function mockSql(first: unknown) {
  if (isTemplateStrings(first)) {
    const query = first.join(" ");
    if (/\b(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(query)) {
      return Promise.resolve(mocks.queryResults.shift() ?? []);
    }
  }
  return { type: "sql-fragment" };
}

function request(path: string, method: string, body?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

async function expectTraced400(responsePromise: Promise<Response>) {
  const response = await responsePromise;
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.any(String),
    traceId: expect.stringMatching(/^(?!no-trace$).+/),
  });
}

describe("assignment API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResults.length = 0;
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID, email: "user@example.com" });
    mocks.sql.mockImplementation(mockSql);
  });

  it.each([
    ["malformed", "{"],
    ["non-object", "null"],
    ["wrong field type", JSON.stringify({ title: "Essay", estimated_hours: "2" })],
  ])("POST returns a traced 400 for %s JSON", async (_label, body) => {
    await expectTraced400(postAssignment(request("/api/assignments", "POST", body)));
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", "{"],
    ["non-object", "[]"],
    ["wrong field type", JSON.stringify({ status: 3 })],
  ])("PATCH returns a traced 400 for %s JSON", async (_label, body) => {
    await expectTraced400(
      patchAssignment(request(`/api/assignments/${ITEM_ID}`, "PATCH", body), {
        params: Promise.resolve({ id: ITEM_ID }),
      }),
    );
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("includes assignment_type in detail and PATCH results", async () => {
    const detail = { id: ITEM_ID, title: "Essay", assignment_type: "manual" };
    const updated = { ...detail, title: "Revised essay" };
    mocks.queryResults.push([detail], [updated]);

    const detailResponse = await getAssignment(
      request(`/api/assignments/${ITEM_ID}`, "GET"),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(await detailResponse.json()).toMatchObject({ assignment_type: "manual" });
    expect((mocks.sql.mock.calls[0][0] as TemplateStringsArray).join(" ")).toContain("assignment_type");

    const patchResponse = await patchAssignment(
      request(`/api/assignments/${ITEM_ID}`, "PATCH", JSON.stringify({ title: "Revised essay" })),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(await patchResponse.json()).toMatchObject({ assignment_type: "manual" });
    const patchQuery = mocks.sql.mock.calls.find(([first]) =>
      isTemplateStrings(first) && first.join(" ").includes("WITH updated"),
    )?.[0] as TemplateStringsArray;
    expect(patchQuery.join(" ")).toContain("assignment_type");
  });

  it("keeps assignment list responses compatible", async () => {
    mocks.queryResults.push([{ id: ITEM_ID, assignment_type: "manual" }]);
    const response = await getAssignments(request("/api/assignments", "GET"));
    expect(await response.json()).toEqual([{ id: ITEM_ID, assignment_type: "manual" }]);
    expect((mocks.sql.mock.calls.at(-1)?.[0] as TemplateStringsArray).join(" ")).toContain("assignment_type");
  });
});

describe("time-block API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResults.length = 0;
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID, email: "user@example.com" });
    mocks.sql.mockImplementation(mockSql);
  });

  it.each([
    "/api/time-blocks?start=not-a-date&end=2026-08-02T11%3A00%3A00Z",
    "/api/time-blocks?start=2026-08-02T12%3A00%3A00Z&end=2026-08-02T11%3A00%3A00Z",
  ])("GET returns 400 for an invalid range: %s", async (path) => {
    await expectTraced400(getTimeBlocks(request(path, "GET")));
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("GET accepts an ordered RFC3339 range", async () => {
    mocks.queryResults.push([]);
    const response = await getTimeBlocks(request(
      "/api/time-blocks?start=2026-08-02T10%3A00%3A00Z&end=2026-08-02T11%3A00%3A00Z",
      "GET",
    ));
    expect(response.status).toBe(200);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it.each([
    JSON.stringify({ starts_at: 1, ends_at: "2026-08-02T11:00:00Z" }),
    JSON.stringify({ starts_at: "2026-08-02T12:00:00Z", ends_at: "2026-08-02T11:00:00Z" }),
  ])("POST rejects invalid types or ordering", async (body) => {
    await expectTraced400(postTimeBlock(request("/api/time-blocks", "POST", body)));
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("PATCH combines a one-sided move with the persisted endpoint and recomputes pomodoros", async () => {
    mocks.queryResults.push(
      [{ starts_at: "2026-08-02T10:00:00Z", ends_at: "2026-08-02T12:00:00Z" }],
      [{ id: ITEM_ID, starts_at: "2026-08-02T11:00:00Z", ends_at: "2026-08-02T12:00:00Z", pomodoro_count: 2 }],
    );
    const response = await patchTimeBlock(
      request(`/api/time-blocks/${ITEM_ID}`, "PATCH", JSON.stringify({ starts_at: "2026-08-02T11:00:00Z" })),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.sql).toHaveBeenCalledTimes(3);
    const updateFragment = mocks.sql.mock.calls.find(([first]) =>
      first && typeof first === "object" && !isTemplateStrings(first) && "pomodoro_count" in first,
    )?.[0] as Record<string, unknown>;
    expect(updateFragment).toMatchObject({
      starts_at: "2026-08-02T11:00:00Z",
      pomodoro_count: 2,
    });
  });

  it("PATCH carries assignment_id:null into the SQL update", async () => {
    mocks.queryResults.push([{ id: ITEM_ID, assignment_id: null }]);
    const response = await patchTimeBlock(
      request(`/api/time-blocks/${ITEM_ID}`, "PATCH", JSON.stringify({ assignment_id: null })),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(response.status).toBe(200);
    const updateFragment = mocks.sql.mock.calls.find(([first]) =>
      first && typeof first === "object" && !isTemplateStrings(first) && "assignment_id" in first,
    )?.[0] as Record<string, unknown>;
    expect(updateFragment).toMatchObject({ assignment_id: null });
  });
});
