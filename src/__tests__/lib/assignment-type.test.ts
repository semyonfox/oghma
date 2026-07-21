import { describe, expect, it } from "vitest";
import {
  getAssignmentTypeLabel,
  normalizeAssignmentType,
} from "@/lib/notes/utils/assignment-type";

describe("assignment type presentation", () => {
  it("keeps known assignment types", () => {
    expect(normalizeAssignmentType("quiz")).toBe("quiz");
    expect(normalizeAssignmentType("assignment")).toBe("assignment");
    expect(normalizeAssignmentType("manual")).toBe("manual");
    expect(normalizeAssignmentType("unknown")).toBe("unknown");
  });

  it("falls back to unknown for missing or unexpected values", () => {
    expect(normalizeAssignmentType(null)).toBe("unknown");
    expect(normalizeAssignmentType("discussion")).toBe("unknown");
  });

  it("returns accessible labels", () => {
    expect(getAssignmentTypeLabel("quiz")).toBe("Quiz");
    expect(getAssignmentTypeLabel("assignment")).toBe("Assignment");
    expect(getAssignmentTypeLabel("manual")).toBe("Manual task");
    expect(getAssignmentTypeLabel("unknown")).toBe("Task");
  });
});
