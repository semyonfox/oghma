import { describe, expect, it } from "vitest";
import {
  assignmentCreateSchema,
  assignmentUpdateSchema,
  chatRequestSchema,
  loginSchema,
  noteCreateSchema,
  noteUpdateSchema,
  paginationSchema,
  quizSessionCreateSchema,
  registerSchema,
  searchQuerySchema,
  timeBlockCreateSchema,
  timeBlockRangeSchema,
  timeBlockUpdateSchema,
  uuidParam,
  validateBody,
} from "@/lib/validations/schemas";

describe("assignment request schemas", () => {
  it("enforces valid assignment types, dates, and numbers", () => {
    expect(assignmentCreateSchema.safeParse({ title: "Essay", due_at: "2026-08-02T10:00:00.000Z", estimated_hours: 2 }).success).toBe(true);
    expect(assignmentUpdateSchema.safeParse({ status: "done", due_at: null, estimated_hours: null }).success).toBe(true);
    expect(assignmentUpdateSchema.safeParse({ status: "finished" }).success).toBe(false);
    expect(assignmentCreateSchema.safeParse({ title: "Essay", due_at: "2026-08-02T10:00:00" }).success).toBe(false);
    expect(assignmentCreateSchema.safeParse({ title: "Essay", estimated_hours: "2" }).success).toBe(false);
  });
});

describe("chat request schema", () => {
  it("rejects wrong message and option types before chat processing", () => {
    expect(chatRequestSchema.safeParse({ message: "Explain recursion", stream: true, background: false }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ message: 1 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "Hi", noteIds: "id" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "Hi", stream: "true" }).success).toBe(false);
  });
});

describe("time block request schemas", () => {
  it("requires valid ordered dates and permits explicitly unlinking an assignment", () => {
    expect(timeBlockCreateSchema.safeParse({ starts_at: "2026-08-02T10:00:00.000Z", ends_at: "2026-08-02T11:00:00.000Z" }).success).toBe(true);
    expect(timeBlockCreateSchema.safeParse({ starts_at: "2026-08-02T11:00:00.000Z", ends_at: "2026-08-02T10:00:00.000Z" }).success).toBe(false);
    expect(timeBlockRangeSchema.safeParse({ start: "not-a-date", end: "2026-08-02T11:00:00.000Z" }).success).toBe(false);
    expect(timeBlockRangeSchema.safeParse({ start: "2026-08-02T11:00:00.000Z", end: "2026-08-02T10:00:00.000Z" }).success).toBe(false);
    const result = timeBlockUpdateSchema.safeParse({ assignment_id: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.assignment_id).toBeNull();
    expect(timeBlockUpdateSchema.safeParse({ completed: "true" }).success).toBe(false);
  });
});

// ─── uuidParam ───────────────────────────────────────────────────────────────

describe("uuidParam", () => {
  it("accepts valid UUIDs", () => {
    expect(
      uuidParam.safeParse("123e4567-e89b-12d3-a456-426614174000").success,
    ).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(uuidParam.safeParse("not-a-uuid").success).toBe(false);
    expect(uuidParam.safeParse("").success).toBe(false);
    expect(uuidParam.safeParse(123).success).toBe(false);
  });
});

// ─── noteCreateSchema ─────────────────────────────────────────────────────────

describe("noteCreateSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(noteCreateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full note payload", () => {
    const result = noteCreateSchema.safeParse({
      title: "My Note",
      content: "Some content",
      isFolder: false,
      pid: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("preserves a valid optimistic note id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = noteCreateSchema.safeParse({ id, title: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(id);
  });

  it("rejects an invalid optimistic note id", () => {
    expect(noteCreateSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects title exceeding 500 characters", () => {
    expect(noteCreateSchema.safeParse({ title: "a".repeat(501) }).success).toBe(
      false,
    );
  });

  it("rejects a non-UUID pid", () => {
    expect(noteCreateSchema.safeParse({ pid: "not-uuid" }).success).toBe(false);
  });

  it("accepts null pid", () => {
    expect(noteCreateSchema.safeParse({ pid: null }).success).toBe(true);
  });
});

// ─── noteUpdateSchema ─────────────────────────────────────────────────────────

describe("noteUpdateSchema", () => {
  it("accepts title only", () => {
    expect(noteUpdateSchema.safeParse({ title: "New title" }).success).toBe(
      true,
    );
  });

  it("accepts content only", () => {
    expect(
      noteUpdateSchema.safeParse({ content: "Updated body" }).success,
    ).toBe(true);
  });

  it("accepts both title and content", () => {
    expect(
      noteUpdateSchema.safeParse({ title: "T", content: "C" }).success,
    ).toBe(true);
  });

  it("rejects empty object (neither field present)", () => {
    expect(noteUpdateSchema.safeParse({}).success).toBe(false);
  });
});

// ─── paginationSchema ─────────────────────────────────────────────────────────

describe("paginationSchema", () => {
  it("defaults to page=1 and limit=50", () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it("coerces string numbers", () => {
    const result = paginationSchema.safeParse({ page: "2", limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    }
  });

  it("rejects limit above 100", () => {
    expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects page less than 1", () => {
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

// ─── searchQuerySchema ────────────────────────────────────────────────────────

describe("searchQuerySchema", () => {
  it("accepts a valid query", () => {
    expect(searchQuerySchema.safeParse({ q: "algorithms" }).success).toBe(true);
  });

  it("rejects empty q", () => {
    expect(searchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });

  it("rejects q over 200 chars", () => {
    expect(searchQuerySchema.safeParse({ q: "a".repeat(201) }).success).toBe(
      false,
    );
  });
});

// ─── loginSchema ──────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({ email: "u@example.com", password: "pass" })
        .success,
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "not-email", password: "pass" }).success,
    ).toBe(false);
  });

  it("rejects empty password", () => {
    expect(
      loginSchema.safeParse({ email: "u@example.com", password: "" }).success,
    ).toBe(false);
  });

  it("rejects password over 128 chars", () => {
    expect(
      loginSchema.safeParse({
        email: "u@example.com",
        password: "x".repeat(129),
      }).success,
    ).toBe(false);
  });
});

// ─── registerSchema ───────────────────────────────────────────────────────────

describe("registerSchema", () => {
  it("accepts valid registration payload", () => {
    expect(
      registerSchema.safeParse({
        email: "u@example.com",
        password: "longEnough1",
      }).success,
    ).toBe(true);
  });

  it("rejects password under 8 chars", () => {
    expect(
      registerSchema.safeParse({ email: "u@example.com", password: "short" })
        .success,
    ).toBe(false);
  });
});

// ─── quizSessionCreateSchema ──────────────────────────────────────────────────

describe("quizSessionCreateSchema", () => {
  it("accepts each filter with its matching value contract", () => {
    for (const input of [
      { filterType: "course", filterValue: "9007199254740993" },
      { filterType: "module", filterValue: 42 },
      {
        filterType: "note",
        filterValue: ["123e4567-e89b-12d3-a456-426614174000"],
      },
      { filterType: "search", filterValue: "graph algorithms" },
      {
        filterType: "chat_session",
        filterValue: "123e4567-e89b-12d3-a456-426614174000",
      },
      { filterType: "all" },
    ]) {
      expect(quizSessionCreateSchema.safeParse(input).success).toBe(true);
    }
  });

  it("preserves 64-bit course IDs and rejects mismatched filter values", () => {
    const parsed = quizSessionCreateSchema.safeParse({
      filterType: "course",
      filterValue: "9007199254740993",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.filterType === "course") {
      expect(parsed.data.filterValue).toBe("9007199254740993");
    }
    expect(
      quizSessionCreateSchema.safeParse({
        filterType: "course",
        filterValue: "not-an-id",
      }).success,
    ).toBe(false);
    expect(
      quizSessionCreateSchema.safeParse({ filterType: "note", filterValue: 42 })
        .success,
    ).toBe(false);
  });

  it("rejects unknown filter type", () => {
    expect(
      quizSessionCreateSchema.safeParse({ filterType: "invalid" }).success,
    ).toBe(false);
  });

  it("rejects maxQuestions above 100", () => {
    expect(
      quizSessionCreateSchema.safeParse({
        filterType: "all",
        maxQuestions: 101,
      }).success,
    ).toBe(false);
  });

  it("rejects maxQuestions below 1", () => {
    expect(
      quizSessionCreateSchema.safeParse({ filterType: "all", maxQuestions: 0 })
        .success,
    ).toBe(false);
  });
});

// ─── validateBody helper ──────────────────────────────────────────────────────

describe("validateBody", () => {
  it("returns success with parsed data for valid input", () => {
    const result = validateBody(loginSchema, {
      email: "u@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("u@example.com");
    }
  });

  it("returns failure with a NextResponse for invalid input", async () => {
    const result = validateBody(loginSchema, { email: "bad", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
      expect(body.validationErrors).toEqual(body.details);
      expect(body.success).toBe(false);
      expect(body.traceId).toMatch(/^(?!no-trace$).+/);
    }
  });
});
