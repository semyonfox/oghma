import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn(() => ({ id: "google" })),
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn(() => ({ id: "github" })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({ id: "credentials" })),
}));

vi.mock("@/database/pgsql", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth-oauth", () => ({
  findOrCreateOAuthUser: vi.fn(),
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  vi.unstubAllEnvs();
});

describe("authConfig providers", () => {
  it("includes only google and github oauth providers", async () => {
    vi.stubEnv("GOOGLE_ID", "google-id");
    vi.stubEnv("GOOGLE_SECRET", "google-secret");
    vi.stubEnv("GITHUB_ID", "github-id");
    vi.stubEnv("GITHUB_SECRET", "github-secret");
    vi.stubEnv("ENABLE_CREDENTIALS_AUTH", "false");

    const { authConfig } = await import("@/auth.config");
    const providerIds = authConfig.providers.map(
      (provider: any) => provider.id,
    );

    expect(providerIds).toEqual(["google", "github"]);
  });
});
