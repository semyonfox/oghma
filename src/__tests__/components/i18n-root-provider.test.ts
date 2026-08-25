import { describe, expect, it } from "vitest";
import {
  localeFromSettingsResponse,
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

describe("localeFromSettingsResponse", () => {
  it("separates a stored language from an account that never chose one", () => {
    expect(localeFromSettingsResponse({ locale: "fr_FR" })).toBe(Locale.FR_FR);
    expect(localeFromSettingsResponse({ theme: "dark" })).toBeNull();
    expect(localeFromSettingsResponse({ locale: "removed-locale" })).toBeNull();
    expect(localeFromSettingsResponse(null)).toBeNull();
  });
});
