import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  isAccountLocked: vi.fn(),
  isRateLimited: vi.fn(),
  recordFailedAttempt: vi.fn(),
  clearFailedAttempts: vi.fn(),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn(() => ({ id: "google" })),
}));
vi.mock("next-auth/providers/github", () => ({
  default: vi.fn(() => ({ id: "github" })),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    id: "credentials",
  })),
}));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/auth-oauth", () => ({
  findOrCreateOAuthUser: vi.fn(),
  resolveVerifiedOAuthEmail: vi.fn(),
}));
vi.mock("@/lib/loginLockout", () => ({
  isAccountLocked: mocks.isAccountLocked,
  isRateLimited: mocks.isRateLimited,
  recordFailedAttempt: mocks.recordFailedAttempt,
  clearFailedAttempts: mocks.clearFailedAttempts,
}));

const password = "correct-password";
const baseUser = {
  user_id: "user-1",
  email: "person@example.com",
  hashed_password: bcrypt.hashSync(password, 4),
  is_active: true,
  deleted_at: null,
  email_verified: true,
};
let account = { ...baseUser };

async function authorizeCredentials(email: string, submittedPassword: string) {
  vi.resetModules();
  vi.stubEnv("ENABLE_CREDENTIALS_AUTH", "true");
  const { authConfig } = await import("@/auth.config");
  const provider = authConfig.providers.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "id" in entry &&
      entry.id === "credentials",
  );
  if (
    !provider ||
    typeof provider !== "object" ||
    !("authorize" in provider) ||
    typeof provider.authorize !== "function"
  ) {
    throw new Error("Credentials provider with authorize callback is required");
  }
  return provider.authorize(
    { email, password: submittedPassword },
    new Request("http://localhost/api/auth/callback/credentials"),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  account = { ...baseUser };
  mocks.isAccountLocked.mockResolvedValue(false);
  mocks.isRateLimited.mockResolvedValue(false);
  mocks.recordFailedAttempt.mockResolvedValue(undefined);
  mocks.clearFailedAttempts.mockResolvedValue(undefined);
  mocks.sql.mockImplementation(
    async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join(" ");
      const email = values[0];
      if (email !== account.email || !account.is_active || account.deleted_at) {
        return [];
      }
      if (query.includes("email_verified = true") && !account.email_verified) {
        return [];
      }
      return [account];
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Auth.js credentials authorize", () => {
  it("rejects an unverified password account", async () => {
    account.email_verified = false;
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
  });

  it("accepts a verified account with the right password", async () => {
    await expect(authorizeCredentials(account.email, password)).resolves.toMatchObject({
      id: account.user_id,
      email: account.email,
    });
  });

  it("blocks a locked account before querying", async () => {
    mocks.isAccountLocked.mockResolvedValue(true);
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("blocks a rate-limited account before querying", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("records a failed password against the shared lockout store", async () => {
    await expect(authorizeCredentials(account.email, "wrong")).resolves.toBeNull();
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith(account.email);
  });

  it("records an unknown account against the shared lockout store", async () => {
    await expect(authorizeCredentials("missing@example.com", password)).resolves.toBeNull();
    expect(mocks.recordFailedAttempt).toHaveBeenCalledWith("missing@example.com");
  });

  it("fails closed when the lockout store is unavailable", async () => {
    mocks.isAccountLocked.mockRejectedValue(new Error("store unavailable"));
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("clears failed attempts after valid credentials", async () => {
    await authorizeCredentials(account.email, password);
    expect(mocks.clearFailedAttempts).toHaveBeenCalledWith(account.email);
  });
});

describe("authConfig providers", () => {
  it("includes only google and github oauth providers when credentials are disabled", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_ID", "google-id");
    vi.stubEnv("GOOGLE_SECRET", "google-secret");
    vi.stubEnv("GITHUB_ID", "github-id");
    vi.stubEnv("GITHUB_SECRET", "github-secret");
    vi.stubEnv("ENABLE_CREDENTIALS_AUTH", "false");

    const { authConfig } = await import("@/auth.config");
    const providerIds = authConfig.providers.map((provider) => {
      if (!provider || typeof provider !== "object" || !("id" in provider)) {
        throw new Error("Expected an auth provider with an id");
      }
      return provider.id;
    });

    expect(providerIds).toEqual(["google", "github"]);
  });
});
