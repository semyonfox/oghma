import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/database/pgsql.js", () => ({ default: vi.fn() }));

import { ApiError, assertTrustedOrigin, parseJsonObject } from "@/lib/api-error";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseJsonObject", () => {
  it("returns a documented 400 error for malformed JSON", async () => {
    await expect(
      parseJsonObject(new Request("https://app.example.com/api/chat", {
        method: "POST", body: "{", headers: { "content-type": "application/json" },
      })),
    ).rejects.toMatchObject({ statusCode: 400, userMessage: "Invalid JSON body" });
  });

  it("rejects null and array JSON request bodies", async () => {
    for (const body of ["null", "[]"]) {
      await expect(parseJsonObject(new Request("https://app.example.com/api/chat", {
        method: "POST", body, headers: { "content-type": "application/json" },
      }))).rejects.toMatchObject({ statusCode: 400, userMessage: "JSON body must be an object" });
    }
  });
});

describe("assertTrustedOrigin", () => {
  it("allows safe methods without browser headers", () => {
    expect(() => {
      assertTrustedOrigin(
        new Request("https://app.example.com/api/settings", { method: "GET" }),
      );
    }).not.toThrow();
  });

  it("allows matching origin", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => {
      assertTrustedOrigin(
        new Request("https://app.example.com/api/settings", {
          method: "POST",
          headers: { origin: "https://app.example.com" },
        }),
      );
    }).not.toThrow();
  });

  it("allows matching referer when origin is absent", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => {
      assertTrustedOrigin(
        new Request("https://app.example.com/api/settings", {
          method: "POST",
          headers: { referer: "https://app.example.com/settings" },
        }),
      );
    }).not.toThrow();
  });

  it("rejects requests without origin context", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => {
      assertTrustedOrigin(
        new Request("https://app.example.com/api/settings", { method: "POST" }),
      );
    }).toThrow(ApiError);
  });

  it("rejects cross-site origins", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(() => {
      assertTrustedOrigin(
        new Request("https://app.example.com/api/settings", {
          method: "POST",
          headers: { origin: "https://evil.example.com" },
        }),
      );
    }).toThrow(ApiError);
  });
});
