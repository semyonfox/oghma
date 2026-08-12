import { describe, expect, it } from "vitest";
import {
  readCachedSettings,
  shouldRevalidateSettings,
} from "@/components/providers/i18n-root-provider";
import { Locale } from "@/locales";

describe("shouldRevalidateSettings", () => {
  it.each([
    "/notes",
    "/notes/note-1",
    "/chat/session-1",
    "/calendar",
    "/quiz",
    "/settings",
  ])("revalidates settings on private app path %s", (pathname) => {
    expect(shouldRevalidateSettings(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/about",
    "/blog",
    "/blog/privacy-first-analytics",
    "/login",
    "/pricing",
    "/notes-public",
  ])("does not fetch authenticated settings on public path %s", (pathname) => {
    expect(shouldRevalidateSettings(pathname)).toBe(false);
  });
});

describe("readCachedSettings", () => {
  it("normalizes a complete cache record and discards malformed cache data", () => {
    expect(readCachedSettings({ locale: "fr_FR", cachedAt: 1 })).toEqual({
      locale: Locale.FR_FR,
      cachedAt: 1,
    });
    expect(readCachedSettings({ locale: "not-real", cachedAt: 1 })).toBeNull();
    expect(readCachedSettings({ locale: "ga", cachedAt: "yesterday" })).toBeNull();
  });
});
