import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import { storableCourseStatuses } from "@/lib/canvas/course-status";

describe("storableCourseStatuses", () => {
  it("keeps what canvas said and never stores a failed lookup", () => {
    expect(
      storableCourseStatuses([
        { id: "101", canvasStatus: "past" },
        { id: 102, canvasStatus: "current" },
        { id: "103", canvasStatus: "unavailable" },
        { id: "104" },
        { id: "not-an-id", canvasStatus: "past" },
      ]),
    ).toEqual([
      { id: "101", status: "past" },
      { id: "102", status: "current" },
    ]);
  });
});
