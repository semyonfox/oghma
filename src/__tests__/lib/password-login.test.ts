import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  compare: vi.fn(),
  reserveLoginAttempt: vi.fn(),
  clearFailedAttempts: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/auth/login-lockout", () => ({
  reserveLoginAttempt: mocks.reserveLoginAttempt,
  clearFailedAttempts: mocks.clearFailedAttempts,
}));

import { authenticatePassword } from "@/lib/auth/password-login";

const { default: realBcrypt } =
  await vi.importActual<typeof import("bcryptjs")>("bcryptjs");

const PASSWORD = "Correct-horse-1";
const account = {
  user_id: "00000000-0000-4000-8000-000000000001",
  email: "Owner@Example.test",
  hashed_password: realBcrypt.hashSync(PASSWORD, 4),
  email_verified: true,
  is_active: true,
  deleted_at: null,
  session_version: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compare.mockImplementation(realBcrypt.compare);
  mocks.reserveLoginAttempt.mockResolvedValue(true);
  mocks.clearFailedAttempts.mockResolvedValue(undefined);
  mocks.sql.mockResolvedValue([account]);
});

describe("authenticatePassword", () => {
  it("runs a full bcrypt comparison for an unknown address", async () => {
    mocks.sql.mockResolvedValue([]);
    await expect(authenticatePassword("missing@example.test", PASSWORD)).resolves.toEqual({
      status: "invalid",
    });
    expect(mocks.compare).toHaveBeenCalledTimes(1);
    const [, hash] = mocks.compare.mock.calls[0];
    expect(realBcrypt.getRounds(hash)).toBe(10);
  });

  it("does not reveal a deactivated account without its password", async () => {
    mocks.sql.mockResolvedValue([{ ...account, is_active: false, deleted_at: new Date() }]);
    await expect(authenticatePassword(account.email, "wrong")).resolves.toEqual({
      status: "invalid",
    });
    await expect(authenticatePassword(account.email, PASSWORD)).resolves.toEqual({
      status: "deactivated",
    });
    expect(mocks.clearFailedAttempts).not.toHaveBeenCalled();
  });

  it("reports an unverified account only after the password matches", async () => {
    mocks.sql.mockResolvedValue([{ ...account, email_verified: false }]);
    await expect(authenticatePassword(account.email, PASSWORD)).resolves.toEqual({
      status: "unverified",
      email: account.email,
    });
    expect(mocks.clearFailedAttempts).not.toHaveBeenCalled();
  });

  it("stops a locked address before the query and bcrypt", async () => {
    mocks.reserveLoginAttempt.mockResolvedValue(false);
    await expect(authenticatePassword(account.email, PASSWORD)).resolves.toEqual({
      status: "rate_limited",
    });
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("normalizes the address once for the lookup and the lockout budget", async () => {
    await expect(authenticatePassword("  OWNER@example.TEST ", PASSWORD)).resolves.toEqual({
      status: "ok",
      user: {
        user_id: account.user_id,
        email: account.email,
        session_version: 3,
      },
    });
    expect(mocks.reserveLoginAttempt).toHaveBeenCalledWith("owner@example.test");
    expect(mocks.sql.mock.calls[0]).toContain("owner@example.test");
    expect(mocks.clearFailedAttempts).toHaveBeenCalledWith("owner@example.test");
  });
});
