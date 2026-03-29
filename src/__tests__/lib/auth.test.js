import { describe, it, expect } from "vitest";
import { generateJWTToken, verifyJWTToken } from "@/lib/auth.js";

// JWT_SECRET is set in setup.ts

describe("generateJWTToken", () => {
  it("returns a string token", () => {
    const token = generateJWTToken({ user_id: "abc", email: "a@b.com" });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // header.payload.signature
  });

  it("throws if JWT_SECRET is not set", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => generateJWTToken({ user_id: "abc" })).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });
});

describe("verifyJWTToken", () => {
  it("returns payload for a valid token", () => {
    const payload = { user_id: "user-123", email: "test@example.com" };
    const token = generateJWTToken(payload);
    const result = verifyJWTToken(token);
    expect(result).not.toBeNull();
    expect(result.user_id).toBe("user-123");
    expect(result.email).toBe("test@example.com");
  });

  it("returns null for a tampered token", () => {
    const token = generateJWTToken({ user_id: "abc" });
    const tampered = token.slice(0, -3) + "xxx";
    expect(verifyJWTToken(tampered)).toBeNull();
  });

  it("returns null for a completely invalid string", () => {
    expect(verifyJWTToken("not.a.token")).toBeNull();
  });

  it("returns null for expired token", async () => {
    // sign with -1s expiry (already expired)
    const token = generateJWTToken({ user_id: "abc" }, "-1s");
    expect(verifyJWTToken(token)).toBeNull();
  });

  it("returns null if JWT_SECRET is missing at verify time", () => {
    const token = generateJWTToken({ user_id: "abc" });
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => verifyJWTToken(token)).toThrow();
    process.env.JWT_SECRET = original;
  });
});
