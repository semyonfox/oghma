import { describe, expect, it } from "vitest";
import {
  isNotEmpty,
  isStrongPassword,
  isValidEmail,
  sanitizeString,
  validateForm,
  validatePassword,
  validateRequiredFields,
} from "@/lib/validation.js";

describe("isValidEmail — extra cases", () => {
  it("accepts plus-addressed email", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects IP-address domain", () => {
    expect(isValidEmail("user@192.168.1.1")).toBe(false);
  });

  it("rejects missing TLD", () => {
    expect(isValidEmail("user@localhost")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("validatePassword — custom options", () => {
  it("accepts a password that skips uppercase check", () => {
    const result = validatePassword("alllower1", { requireUppercase: false });
    expect(result.isValid).toBe(true);
  });

  it("enforces special char when required", () => {
    const result = validatePassword("NoSpecial1", { requireSpecialChar: true });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("special"))).toBe(true);
  });

  it("passes special char requirement when present", () => {
    const result = validatePassword("Has@Special1", {
      requireSpecialChar: true,
    });
    expect(result.isValid).toBe(true);
  });

  it("enforces custom minLength", () => {
    const result = validatePassword("Short1A", { minLength: 10 });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("10"))).toBe(true);
  });

  it("rejects password over 128 chars", () => {
    const result = validatePassword("A1" + "a".repeat(127));
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("128"))).toBe(true);
  });

  it("returns multiple errors at once", () => {
    // too short AND no uppercase AND no number
    const result = validatePassword("ab");
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("isStrongPassword", () => {
  it("returns true for a strong password", () => {
    expect(isStrongPassword("StrongPass1")).toBe(true);
  });

  it("returns false for a weak password", () => {
    expect(isStrongPassword("weak")).toBe(false);
  });
});

describe("validateRequiredFields — extra cases", () => {
  it("fails for whitespace-only string", () => {
    const result = validateRequiredFields({ name: "   " });
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain("name");
  });

  it("passes for numeric zero (0 is a valid value)", () => {
    const result = validateRequiredFields({ count: 0 });
    expect(result.isValid).toBe(true);
  });

  it("passes for false boolean", () => {
    const result = validateRequiredFields({ active: false });
    expect(result.isValid).toBe(true);
  });
});

describe("isNotEmpty — extra cases", () => {
  it("returns true for number zero", () => {
    expect(isNotEmpty(0)).toBe(true);
  });

  it("returns true for false boolean", () => {
    expect(isNotEmpty(false)).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isNotEmpty({})).toBe(false);
  });

  it("returns true for non-empty object", () => {
    expect(isNotEmpty({ key: "value" })).toBe(true);
  });
});

describe("sanitizeString", () => {
  it("trims whitespace from strings", () => {
    expect(sanitizeString("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeString(null)).toBe("");
    expect(sanitizeString(42)).toBe("");
    expect(sanitizeString(undefined)).toBe("");
  });
});

describe("validateForm", () => {
  it("returns isValid true when all validators pass", () => {
    const result = validateForm(
      {
        email: (v) => ({ isValid: !!v, error: v ? null : "Required" }),
        name: (v) => ({ isValid: !!v, error: v ? null : "Required" }),
      },
      { email: "a@b.com", name: "Alice" },
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accumulates errors from failing validators", () => {
    const result = validateForm(
      {
        email: (v) => ({ isValid: !!v, error: v ? null : "Email required" }),
        name: (v) => ({ isValid: !!v, error: v ? null : "Name required" }),
      },
      { email: "", name: "" },
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.email).toBe("Email required");
    expect(result.errors.name).toBe("Name required");
  });

  it("ignores validators that return isValid:true even with an error string", () => {
    const result = validateForm(
      { field: () => ({ isValid: true, error: "ignored warning" }) },
      { field: "value" },
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
