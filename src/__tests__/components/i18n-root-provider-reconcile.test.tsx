// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));

import I18nRootProvider from "@/components/providers/i18n-root-provider";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale } from "@/locales";

function LocaleProbe() {
  const { activeLocale } = useI18n();
  return <output>{activeLocale}</output>;
}

function renderWithServerLocale(locale: Locale) {
  return render(
    <I18nRootProvider initialLocaleData={{ locale, dict: {} }}>
      <LocaleProbe />
    </I18nRootProvider>,
  );
}

function settingsPosts() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST");
}

describe("I18nRootProvider account reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "ogma-locale=; path=/; max-age=0";
    localStorage.clear();
  });

  it("adopts a language picked before signing in when the account has none", async () => {
    document.cookie = "ogma-locale=ga; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ theme: "system" }),
      }),
    );

    renderWithServerLocale(Locale.EN);

    await waitFor(() =>
      expect(settingsPosts()).toEqual([
        [
          "/api/settings",
          expect.objectContaining({ body: JSON.stringify({ locale: Locale.GA }) }),
        ],
      ]),
    );
    expect(screen.getByText(Locale.GA)).toBeTruthy();
  });

  it("applies a stored account language over the browser preference", async () => {
    document.cookie = "ogma-locale=ga; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ locale: Locale.FR_FR }),
      }),
    );

    renderWithServerLocale(Locale.EN);

    await waitFor(() => expect(screen.getByText(Locale.FR_FR)).toBeTruthy());
    expect(settingsPosts()).toEqual([]);
  });

  it("leaves the account alone when the visitor never picked a language", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ theme: "system" }),
      }),
    );

    renderWithServerLocale(Locale.FR_FR);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(settingsPosts()).toEqual([]);
    expect(screen.getByText(Locale.FR_FR)).toBeTruthy();
  });
});
