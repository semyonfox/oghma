import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: sqlMock }));

import { GET } from "@/app/api/calendar/ical/[token]/route";

const CURRENT_TOKEN = "11111111-1111-4111-8111-111111111111";
const OLD_TOKEN = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

type AccountState = "active" | "inactive" | "deleted";

function arrange(account: AccountState) {
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
    if (query.includes("FROM app.assignments") || query.includes("FROM app.time_blocks")) return [];
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
});
