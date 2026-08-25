import { describe, expect, it } from "vitest";
import {
  Locale,
  localeFromAcceptLanguage,
  normalizeLocale,
  supportedLocales,
} from "@/locales";
import { loadLocaleData } from "@/lib/i18n/locale-data";

describe("locale normalization", () => {
  it("accepts supported locales case-insensitively and resolves browser language tags", () => {
    expect(normalizeLocale("fr-FR")).toBe(Locale.FR_FR);
    expect(normalizeLocale("FR-fr")).toBe(Locale.FR_FR);
    expect(normalizeLocale("fr_FR")).toBe(Locale.FR_FR);
    expect(normalizeLocale("fr")).toBe(Locale.FR_FR);
    expect(normalizeLocale("en-IE")).toBe(Locale.EN);
    expect(normalizeLocale("not-a-locale")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });

  it("honors Accept-Language quality values and ignores explicitly rejected locales", () => {
    expect(localeFromAcceptLanguage("ga;q=0.4, fr-FR;q=0.9, en;q=0.8")).toBe(
      Locale.FR_FR,
    );
    expect(localeFromAcceptLanguage("fr;q=0, ga;q=0.5")).toBe(Locale.GA);
    expect(
      localeFromAcceptLanguage("fr-FR; q=0.4, ga;Q=0.9, en;q=0.8"),
    ).toBe(Locale.GA);
    expect(localeFromAcceptLanguage("ga;q=1.2, fr;q=0.5")).toBe(
      Locale.FR_FR,
    );
    expect(localeFromAcceptLanguage("ga;q=0.8, fr;q=0.8")).toBe(Locale.GA);
    expect(localeFromAcceptLanguage("unknown;q=1")).toBeNull();
  });
});

describe("locale dictionary registry", () => {
  it("loads every allowlisted locale with the base catalog shape", async () => {
    const dictionaries = await Promise.all(supportedLocales.map(loadLocaleData));

    expect(dictionaries.map(({ locale }) => locale)).toEqual(supportedLocales);
    for (const { dict } of dictionaries) {
      expect(dict).toHaveProperty("Settings");
      expect(dict).toHaveProperty("Language");
    }
  });
});
