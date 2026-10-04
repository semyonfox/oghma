import { beforeEach, describe, expect, it, vi } from "vitest";
import sql from "@/database/pgsql";
import { reserveLoginAttempt, clearFailedAttempts } from "@/lib/loginLockout";
import { authConfig } from "@/auth.config";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
const mocks = vi.hoisted(() => ({ compare: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/loginLockout", () => ({
  reserveLoginAttempt: vi.fn(),
  clearFailedAttempts: vi.fn(),
}));
vi.mock("@/lib/auth-oauth", () => ({
  findOrCreateOAuthUser: vi.fn(),
  resolveVerifiedOAuthEmail: vi.fn(),
}));
vi.mock("@/lib/i18n/server", () => ({ getRequestLocale: vi.fn() }));
const provider = authConfig.providers.find(
  (p) => typeof p !== "function" && p.id === "credentials",
);
if (
  !provider ||
  typeof provider === "function" ||
  provider.type !== "credentials"
)
  throw new Error("Credentials must be enabled by default");
const authorize = provider.options?.authorize ?? provider.authorize;
if (typeof authorize !== "function")
  throw new Error("Credentials callback is missing");
const user = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  hashed_password: "synthetic",
  email_verified: true,
  session_version: 0,
};
const request = new Request(
  "https://example.test/api/auth/callback/credentials",
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sql).mockResolvedValue([user]);
  mocks.compare.mockResolvedValue(true);
  vi.mocked(reserveLoginAttempt).mockResolvedValue(true);
});

describe("Auth.js default credentials boundary", () => {
  it("rejects unverified registrations even when the password matches", async () => {
    vi.mocked(sql).mockResolvedValue([{ ...user, email_verified: false }]);
    await expect(
      authorize({ email: user.email, password: "synthetic" }, request),
    ).resolves.toBeNull();
    expect(clearFailedAttempts).not.toHaveBeenCalled();
  });
  it("stops a locked account before bcrypt and handles store failure closed", async () => {
    vi.mocked(reserveLoginAttempt).mockResolvedValue(false);
    await expect(
      authorize({ email: user.email, password: "synthetic" }, request),
    ).resolves.toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
    vi.mocked(reserveLoginAttempt).mockRejectedValue(
      new Error("synthetic outage"),
    );
    await expect(
      authorize({ email: user.email, password: "synthetic" }, request),
    ).resolves.toBeNull();
  });
  it("bounds passwords before bcrypt and shares normalized accounting", async () => {
    await expect(
      authorize({ email: user.email, password: "x".repeat(129) }, request),
    ).resolves.toBeNull();
    expect(reserveLoginAttempt).not.toHaveBeenCalled();
    await expect(
      authorize(
        { email: "Owner@Example.test", password: "synthetic" },
        request,
      ),
    ).resolves.toMatchObject({ id: user.user_id, session_version: 0 });
    expect(reserveLoginAttempt).toHaveBeenCalledWith("owner@example.test");
    expect(clearFailedAttempts).toHaveBeenCalledWith("owner@example.test");
  });
});
