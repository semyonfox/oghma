import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ insertNoteWithTree: vi.fn() }));

// mock the database module before importing the module under test
vi.mock("@/database/pgsql", () => {
  const mockSql = vi.fn() as ReturnType<typeof vi.fn> & {
    begin: ReturnType<typeof vi.fn>;
  };
  mockSql.begin = vi.fn();
  return { default: mockSql };
});

// mock bcrypt and crypto for findOrCreateOAuthUser
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("$2a$10$hashed") },
}));
vi.mock("crypto", () => ({
  default: { randomBytes: () => ({ toString: () => "random-hex" }) },
}));
vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/notes/storage/create-note", () => ({
  insertNoteWithTree: mocks.insertNoteWithTree,
}));

import {
  findOrCreateOAuthUser,
  OAuthAccountUnavailableError,
  resolveVerifiedOAuthEmail,
} from "@/lib/auth/oauth";
import sql from "@/database/pgsql";
import { Locale } from "@/locales";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  (sql as typeof sql & { begin: ReturnType<typeof vi.fn> }).begin.mockReset();
  mocks.insertNoteWithTree.mockResolvedValue(undefined);
});

describe("resolveVerifiedOAuthEmail", () => {
  it("accepts a Google email only when the profile marks it verified", async () => {
    await expect(
      resolveVerifiedOAuthEmail("google", {
        email: "Student@Example.com",
        email_verified: true,
      }),
    ).resolves.toBe("student@example.com");
    await expect(
      resolveVerifiedOAuthEmail("google", { email: "student@example.com" }),
    ).resolves.toBeNull();
  });

  it("uses GitHub's authenticated primary verified email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          { email: "other@example.com", primary: false, verified: true },
          { email: "Primary@Example.com", primary: true, verified: true },
        ]),
      ),
    );

    await expect(
      resolveVerifiedOAuthEmail("github", {}, "github-token"),
    ).resolves.toBe("primary@example.com");
  });
});

describe("findOrCreateOAuthUser", () => {
  const profile = { provider: "google", providerAccountId: "g-123", email: "owner@example.test" };
  function transaction(
    options: {
      linked?: boolean;
      created?: boolean;
      verified?: boolean;
      active?: boolean;
    } = {},
  ) {
    const tx = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("SELECT user_id FROM app.oauth_accounts"))
        return options.linked ? [{ user_id: "u-existing" }] : [];
      if (query.includes("INSERT INTO app.login"))
        return options.created ? [{ user_id: "u-existing" }] : [];
      if (
        query.includes(
          "SELECT user_id FROM app.login WHERE lower(btrim(email))",
        )
      )
        return [{ user_id: "u-existing" }];
      if (query.includes("SELECT user_id, email_verified"))
        return [
          {
            user_id: "u-existing",
            email_verified: options.verified ?? true,
            is_active: options.active ?? true,
            deleted_at: null,
          },
        ];
      return [];
    });
    (
      sql as typeof sql & { begin: ReturnType<typeof vi.fn> }
    ).begin.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    return tx;
  }
  it("retains verified users' credentials when linking another provider", async () => {
    const tx = transaction({ verified: true });
    await expect(findOrCreateOAuthUser(profile, { email_verified: true })).resolves.toBe("u-existing");
    expect(tx.mock.calls.some(([parts]) => parts.join('').includes('hashed_password ='))).toBe(false);
  });
  it("replaces an unverified registrant's password and revokes every outstanding token atomically", async () => {
    const tx = transaction({ verified: false });
    await findOrCreateOAuthUser(profile, { email_verified: true });
    const update = tx.mock.calls.find(([parts]) =>
      parts.join("").includes("hashed_password ="),
    );
    expect(update?.[0].join("")).toContain(
      "session_version = session_version + 1",
    );
    expect(update?.[0].join("")).toContain("verification_token = NULL");
    expect(update?.[0].join("")).toContain("reset_token = NULL");
    expect(
      tx.mock.calls.some(([parts]) => parts.join("").includes("FOR UPDATE")),
    ).toBe(true);
  });
  it("rejects a deactivated linked account with a typed error the sign-in page can explain", async () => {
    transaction({ linked: true, active: false });
    await expect(findOrCreateOAuthUser(profile, { email_verified: true })).rejects.toBeInstanceOf(
      OAuthAccountUnavailableError,
    );
  });
  it("seeds the requested locale only for a newly inserted account", async () => {
    transaction({ created: true });
    await findOrCreateOAuthUser(profile, { email_verified: true }, Locale.de_DE);
    expect(mocks.insertNoteWithTree).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ title: "Erste Schritte" }),
    );
  });
  it("does not seed a second note after a registration race", async () => {
    transaction();
    await findOrCreateOAuthUser(profile, { email_verified: true });
    expect(mocks.insertNoteWithTree).not.toHaveBeenCalled();
  });
  it("rejects an unverified provider before starting a transaction", async () => {
    await expect(findOrCreateOAuthUser(profile, { email_verified: false })).rejects.toThrow('verified email');
    expect(sql.begin).not.toHaveBeenCalled();
  });
});
