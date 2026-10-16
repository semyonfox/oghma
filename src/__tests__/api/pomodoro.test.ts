import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = vi.fn();
  const sql = Object.assign(vi.fn(), {
    begin: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  });
  return { sql, tx, validateSession: vi.fn() };
});

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth/session", () => ({
  validateSession: mocks.validateSession,
  validateSessionLite: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { PATCH } from "@/app/api/pomodoro/route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";
const ASSIGNMENT_ID = "123e4567-e89b-42d3-a456-426614174002";

function endSession(completed: boolean) {
  return PATCH(
    new NextRequest("http://localhost/api/pomodoro", {
      method: "PATCH",
      body: JSON.stringify({ id: SESSION_ID, completed }),
      headers: { "content-type": "application/json" },
    }),
  );
}

function focusSession(startedAt: string, endedAt: string) {
  return {
    id: SESSION_ID,
    assignment_id: ASSIGNMENT_ID,
    duration_mins: 25,
    type: "focus",
    started_at: new Date(startedAt),
    ended_at: new Date(endedAt),
    completed: true,
  };
}

// routes each transaction query by its leading statement
function arrange(rows: { endUpdate: unknown[]; existing?: unknown[] }) {
  const queries: { text: string; values: unknown[] }[] = [];
  mocks.tx.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.join("?");
    queries.push({ text, values });
    if (text.includes("UPDATE app.pomodoro_sessions")) return rows.endUpdate;
    if (text.includes("SELECT * FROM app.pomodoro_sessions")) return rows.existing ?? [];
    if (text.includes("UPDATE app.assignments")) return [];
    throw new Error(`Unexpected query: ${text}`);
  });
  return queries;
}

describe("PATCH /api/pomodoro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID, email: "user@example.com" });
  });

  it("credits a full pomodoro once and only ends an open session", async () => {
    const queries = arrange({
      endUpdate: [focusSession("2026-10-06T09:00:00Z", "2026-10-06T09:25:02Z")],
    });

    const response = await endSession(true);

    expect(response.status).toBe(200);
    expect(queries[0].text).toMatch(/ended_at IS NULL/);
    const credit = queries.find((query) => query.text.includes("UPDATE app.assignments"));
    expect(credit?.values[0]).toBeCloseTo(25 / 60);
  });

  it("does not credit hours again when the session already ended", async () => {
    const queries = arrange({
      endUpdate: [],
      existing: [focusSession("2026-10-06T09:00:00Z", "2026-10-06T09:25:00Z")],
    });

    const response = await endSession(true);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: SESSION_ID });
    expect(queries.some((query) => query.text.includes("UPDATE app.assignments"))).toBe(false);
  });

  it("caps credited time at the wall-clock duration of the session", async () => {
    const queries = arrange({
      endUpdate: [focusSession("2026-10-06T09:00:00Z", "2026-10-06T09:02:00Z")],
    });

    await endSession(true);

    const credit = queries.find((query) => query.text.includes("UPDATE app.assignments"));
    // two minutes elapsed plus the one-minute start grace, not the planned 25
    expect(credit?.values[0]).toBeCloseTo(3 / 60);
  });

  it("returns 404 for a session the caller doesn't own", async () => {
    arrange({ endUpdate: [], existing: [] });

    const response = await endSession(true);

    expect(response.status).toBe(404);
  });
});
