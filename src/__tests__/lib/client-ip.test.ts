import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/rateLimiter";

function makeRequest(headers: Record<string, string>): any {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe("getClientIp", () => {
  it("reads the first IP from x-forwarded-for", () => {
    const req = makeRequest({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12",
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace from x-forwarded-for entries", () => {
    const req = makeRequest({ "x-forwarded-for": "  203.0.113.5 , 10.0.0.1" });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "198.51.100.7" });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("returns 0.0.0.0 when no IP headers are present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("0.0.0.0");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("handles an x-forwarded-for with a single entry", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.1" });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });
});
