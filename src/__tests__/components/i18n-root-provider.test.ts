import { describe, expect, it } from "vitest";
import { shouldRevalidateSettings } from "@/components/providers/i18n-root-provider";

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
