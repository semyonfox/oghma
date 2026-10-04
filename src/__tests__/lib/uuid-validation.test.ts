import { describe, it, expect } from "vitest";
import { isValidUUID } from "@/lib/utils/uuid";

describe("isValidUUID", () => {
  it("accepts a valid v4 UUID", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts a valid v7 UUID", () => {
    expect(isValidUUID("01963b3a-7c50-7000-8000-000000000001")).toBe(true);
  });

  it("accepts uppercase UUID", () => {
    expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects string without hyphens", () => {
    expect(isValidUUID("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUUID("")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidUUID(12345)).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
  });

  it("rejects UUID with wrong length", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
  });

  it("rejects UUID with invalid hex characters", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-44665544zzzz")).toBe(false);
  });
});
