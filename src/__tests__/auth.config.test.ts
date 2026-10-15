import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  reserveLoginAttempt: vi.fn(),
  clearFailedAttempts: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
  resolveVerifiedOAuthEmail: vi.fn(),
  OAuthAccountUnavailableError: class OAuthAccountUnavailableError extends Error {},
  checkRateLimit: vi.fn(),
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

vi.mock("@/lib/auth/oauth", () => ({
  findOrCreateOAuthUser: mocks.findOrCreateOAuthUser,
  resolveVerifiedOAuthEmail: mocks.resolveVerifiedOAuthEmail,
  OAuthAccountUnavailableError: mocks.OAuthAccountUnavailableError,
}));
vi.mock("@/lib/i18n/server", () => ({
  getRequestLocale: vi.fn().mockResolvedValue("en"),
}));

vi.mock("@/lib/rate-limiter", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limiter")>()),
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/auth/login-lockout", () => ({
  reserveLoginAttempt: mocks.reserveLoginAttempt,
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
    new Request("http://localhost/api/auth/callback/credentials", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    }),
  );
}

async function oauthSignIn() {
  vi.resetModules();
  const { authConfig } = await import("@/auth.config");
  const signIn = authConfig.callbacks?.signIn;
  if (!signIn) throw new Error("signIn callback is required");
  const user = { id: "google-sub", email: "person@example.com", name: "Person" };
  const result = await signIn({
    user,
    account: {
      provider: "google",
      providerAccountId: "google-sub",
      type: "oidc",
      access_token: "provider-token",
    },
    profile: { email: "person@example.com", email_verified: true },
  });
  return { result, user };
}

beforeEach(() => {
  vi.clearAllMocks();
  account = { ...baseUser };
  mocks.reserveLoginAttempt.mockResolvedValue(true);
  mocks.checkRateLimit.mockResolvedValue(null);
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

  // the attempt is reserved against the shared budget before the account is read,
  // so a locked or rate-limited email never reaches the query or bcrypt
  it("blocks a locked or rate-limited account before querying", async () => {
    mocks.reserveLoginAttempt.mockResolvedValue(false);
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("counts a failed password against the shared lockout store", async () => {
    await expect(authorizeCredentials(account.email, "wrong")).resolves.toBeNull();
    expect(mocks.reserveLoginAttempt).toHaveBeenCalledWith(account.email);
    expect(mocks.clearFailedAttempts).not.toHaveBeenCalled();
  });

  it("counts an unknown account against the shared lockout store", async () => {
    await expect(authorizeCredentials("missing@example.com", password)).resolves.toBeNull();
    expect(mocks.reserveLoginAttempt).toHaveBeenCalledWith("missing@example.com");
    expect(mocks.clearFailedAttempts).not.toHaveBeenCalled();
  });

  it("fails closed when the lockout store is unavailable", async () => {
    mocks.reserveLoginAttempt.mockRejectedValue(new Error("store unavailable"));
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  // the Auth.js callback is a second password endpoint, so it shares the per-ip login budget
  it("refuses an ip over the login budget before touching the account", async () => {
    mocks.checkRateLimit.mockResolvedValue(
      Response.json({ error: "Too many requests" }, { status: 429 }),
    );
    await expect(authorizeCredentials(account.email, password)).resolves.toBeNull();
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("login", "203.0.113.7");
    expect(mocks.reserveLoginAttempt).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("clears failed attempts after valid credentials", async () => {
    await authorizeCredentials(account.email, password);
    expect(mocks.clearFailedAttempts).toHaveBeenCalledWith(account.email);
  });
});

describe("Auth.js oauth signIn callback", () => {
  beforeEach(() => {
    mocks.resolveVerifiedOAuthEmail.mockResolvedValue("person@example.com");
    mocks.findOrCreateOAuthUser.mockResolvedValue("user-1");
  });

  it("links the verified provider account and adopts its user id", async () => {
    const { result, user } = await oauthSignIn();
    expect(result).toBe(true);
    expect(user.id).toBe("user-1");
    expect(mocks.findOrCreateOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        providerAccountId: "google-sub",
        email: "person@example.com",
      }),
      expect.objectContaining({ email_verified: true }),
      "en",
    );
  });

  it("sends a provider without a verified email to a page that says so", async () => {
    mocks.resolveVerifiedOAuthEmail.mockResolvedValue(null);
    const { result } = await oauthSignIn();
    expect(result).toBe("/auth/error?error=NoVerifiedEmail");
    expect(mocks.findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  it("tells a deleted account what happened instead of a generic denial", async () => {
    mocks.findOrCreateOAuthUser.mockRejectedValue(
      new mocks.OAuthAccountUnavailableError("unavailable"),
    );
    const { result } = await oauthSignIn();
    expect(result).toBe("/auth/error?error=AccountDeleted");
  });

  it("still denies access for any other linking failure", async () => {
    mocks.findOrCreateOAuthUser.mockRejectedValue(new Error("db down"));
    const { result } = await oauthSignIn();
    expect(result).toBe(false);
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
