import { describe, expect, it } from "vitest";
import { validateAuthCredentials } from "@/lib/auth-credentials";

describe("auth credential validation", () => {
  it("accepts existing-account passwords without applying signup policy", () => {
    expect(
      validateAuthCredentials("student+notes@example.com", "weak", false),
    ).toEqual({ isValid: true, errors: {} });
  });

  it.each([
    [undefined, "password", { email: "Email is required" }],
    ["student@example.com", "   ", { password: "Password is required" }],
    ["student@localhost", "password", { email: "Invalid email format" }],
  ])(
    "rejects invalid login input",
    (email, password, expectedErrors) => {
      expect(validateAuthCredentials(email, password, false)).toEqual({
        isValid: false,
        errors: expectedErrors,
      });
    },
  );

  it("accepts a signup password that meets the active policy", () => {
    expect(
      validateAuthCredentials("student@example.com", "StrongPass1", true),
    ).toEqual({ isValid: true, errors: {} });
  });

  it.each([
    ["Short1", "at least 8 characters"],
    ["alllowercase1", "uppercase letter"],
    ["ALLUPPERCASE1", "lowercase letter"],
    ["NoNumbersHere", "number"],
    [`A1${"a".repeat(127)}`, "128 characters or fewer"],
  ])("rejects signup password policy violations", (password, message) => {
    const result = validateAuthCredentials(
      "student@example.com",
      password,
      true,
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.password).toContain(message);
  });
});
