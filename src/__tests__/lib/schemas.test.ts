import { describe, expect, it } from "vitest";
import {
  loginSchema,
  noteCreateSchema,
  noteUpdateSchema,
  paginationSchema,
  quizSessionCreateSchema,
  registerSchema,
  searchQuerySchema,
  uuidParam,
  validateBody,
} from "@/lib/validations/schemas";

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
  it("accepts valid filter types", () => {
    for (const filterType of [
      "course",
      "module",
      "note",
      "search",
      "chat_session",
      "all",
    ]) {
      expect(quizSessionCreateSchema.safeParse({ filterType }).success).toBe(
        true,
      );
    }
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
    }
  });
});
