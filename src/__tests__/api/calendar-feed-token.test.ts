import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: sqlMock }));
// the feed is public; the session module is mocked only because api-error imports it
vi.mock("@/lib/auth/session", () => ({
  validateSession: vi.fn(),
  validateSessionLite: vi.fn(),
}));

import { GET } from "@/app/api/calendar/ical/[token]/route";

const CURRENT_TOKEN = "11111111-1111-4111-8111-111111111111";
const OLD_TOKEN = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

type AccountState = "active" | "inactive" | "deleted";

function arrange(
  account: AccountState,
  rows: { assignments?: unknown[]; timeBlocks?: unknown[] } = {},
) {
  const queries: string[] = [];
  sqlMock.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?");
    queries.push(query);
    if (query.includes("FROM app.login")) {
      if (values[0] !== CURRENT_TOKEN) return [];
      const hasActiveGuard = /is_active\s*=\s*(?:TRUE|true)/.test(query);
      const hasDeletedGuard = /deleted_at\s+IS\s+NULL/i.test(query);
      if (account === "inactive" && hasActiveGuard) return [];
      if (account === "deleted" && hasDeletedGuard) return [];
      return [{ user_id: USER_ID }];
    }
    if (query.includes("FROM app.time_blocks")) return rows.timeBlocks ?? [];
    if (query.includes("FROM app.assignments")) return rows.assignments ?? [];
    throw new Error(`Unexpected query: ${query}`);
  });
  return queries;
}

async function fetchFeed(token = CURRENT_TOKEN) {
  return GET(new NextRequest(`http://localhost/api/calendar/ical/${token}`), {
    params: Promise.resolve({ token }),
  });
}

describe("calendar bearer feed", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("serves an active account and checks both account-state predicates", async () => {
    const queries = arrange("active");
    const response = await fetchFeed();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("BEGIN:VCALENDAR");
    expect(queries[0]).toMatch(/is_active\s*=\s*(?:TRUE|true)/);
    expect(queries[0]).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it.each(["inactive", "deleted"] as const)(
    "rejects a %s account without reading event rows",
    async (state) => {
      const queries = arrange(state);
      const response = await fetchFeed();
      expect(response.status).toBe(404);
      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatch(/is_active\s*=\s*(?:TRUE|true)/);
      expect(queries[0]).toMatch(/deleted_at\s+IS\s+NULL/i);
    },
  );

  it("rejects a rotated or missing token", async () => {
    const queries = arrange("active");
    const response = await fetchFeed(OLD_TOKEN);
    expect(response.status).toBe(404);
    expect(queries).toHaveLength(1);
  });

  it.each([
    "------------------------------------",
    "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
    "not-a-token",
  ])("rejects malformed token %s before touching the database", async (token) => {
    const queries = arrange("active");
    const response = await fetchFeed(token);
    expect(response.status).toBe(404);
    expect(queries).toHaveLength(0);
  });

  it("scopes the joined assignment to the feed owner", async () => {
    const queries = arrange("active");
    await fetchFeed();

    const blockQuery = queries.find((query) => query.includes("FROM app.time_blocks"));
    expect(blockQuery).toMatch(/a\.user_id = tb\.user_id/);
  });

  it("serves RFC 5545 output with VEVENT-valid statuses", async () => {
    arrange("active", {
      assignments: [{
        id: "a1",
        title: "Essay",
        description: "<p>Write <b>2000</b> words</p>",
        course_name: "CT216",
        due_at: new Date("2026-10-10T22:59:00Z"),
        status: "done",
      }],
      timeBlocks: [{
        id: "b1",
        title: null,
        starts_at: new Date("2026-10-08T09:00:00Z"),
        ends_at: new Date("2026-10-08T10:00:00Z"),
        completed: true,
        assignment_title: "Essay",
        course_name: "CT216",
      }],
    });

    const response = await fetchFeed();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(body).not.toMatch(/(^|[^\r])\n/);
    expect(body).not.toContain("STATUS:COMPLETED");
    expect(body).toContain("SUMMARY:[CT216] Study: Essay");
    expect(body).toContain("DESCRIPTION:Write 2000 words\\nStatus: Done");
  });
});
