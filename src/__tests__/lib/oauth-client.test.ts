import { describe, expect, it } from "vitest";

import {
  buildOAuthSignInOptions,
  isOAuthProviderConfigured,
} from "@/lib/oauth-client";

describe("isOAuthProviderConfigured", () => {
  it("returns true when provider exists in map", () => {
    expect(isOAuthProviderConfigured("google", { google: {} })).toBe(true);
  });

  it("returns false when provider does not exist", () => {
    expect(isOAuthProviderConfigured("google", { github: {} })).toBe(false);
  });

  it("returns false when providers map is empty", () => {
    expect(isOAuthProviderConfigured("google", {})).toBe(false);
  });

  it("returns false when providers map is missing", () => {
    expect(isOAuthProviderConfigured("google", null)).toBe(false);
    expect(isOAuthProviderConfigured("google", undefined)).toBe(false);
  });
});

describe("buildOAuthSignInOptions", () => {
  it("uses callbackUrl key with redirect enabled", () => {
    expect(buildOAuthSignInOptions("/notes")).toEqual({
      callbackUrl: "/notes",
      redirect: true,
    });
  });

  it("defaults callbackUrl to /notes", () => {
    expect(buildOAuthSignInOptions()).toEqual({
      callbackUrl: "/notes",
      redirect: true,
    });
  });
});
