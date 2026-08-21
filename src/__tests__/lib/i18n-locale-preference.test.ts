// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  persistClientLocale,
  readClientLocale,
} from "@/lib/i18n/locale-preference";
import { LOCALE_COOKIE_NAME, Locale } from "@/locales";

describe("client locale preference", () => {
  beforeEach(() => {
    document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0`;
  });

  it("round-trips the language the server renders from", () => {
    persistClientLocale(Locale.ZH_CN);

    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=zh-CN`);
    expect(readClientLocale()).toBe(Locale.ZH_CN);
  });

  it("reads nothing when no language has been chosen", () => {
    expect(readClientLocale()).toBeNull();
  });

  it("discards a locale that the app no longer supports", () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=removed-locale; path=/`;

    expect(readClientLocale()).toBeNull();
  });

  it("survives a cookie written alongside other cookies", () => {
    document.cookie = "ogma-theme=dark; path=/";
    persistClientLocale(Locale.GA);

    expect(readClientLocale()).toBe(Locale.GA);
  });
});
