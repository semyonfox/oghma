// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/about";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => vi.unstubAllGlobals());

import I18nRootProvider, {
  localeFromSettingsResponse,
  shouldRevalidateSettings,
} from "@/components/providers/i18n-root-provider";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale } from "@/locales";

function TranslationProbe() {
  const { activeLocale, locale, t } = useI18n();
  return (
    <>
      <output>{`${activeLocale}:${t("Language")}`}</output>
      <button
        type="button"
        onClick={() => locale(Locale.GA, { Language: "Teanga" })}
      >
        Switch
      </button>
    </>
  );
}

describe("I18nRootProvider", () => {
  it("renders the server-resolved locale before client reconciliation", () => {
    render(
      <I18nRootProvider
        initialLocaleData={{ locale: Locale.FR_FR, dict: { Language: "Langue" } }}
      >
        <TranslationProbe />
      </I18nRootProvider>,
    );

    expect(screen.getByText("fr-FR:Langue")).toBeTruthy();
  });

  it("keeps the document language aligned with an immediate selector change", async () => {
    render(
      <I18nRootProvider
        initialLocaleData={{ locale: Locale.EN, dict: { Language: "Language" } }}
      >
        <TranslationProbe />
      </I18nRootProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() => {
      expect(screen.getByText("ga:Teanga")).toBeTruthy();
      expect(document.documentElement.lang).toBe(Locale.GA);
    });
  });
});

describe("I18nRootProvider server reconciliation", () => {
  beforeEach(() => {
    document.cookie = "ogma-locale=; path=/; max-age=0";
    localStorage.clear();
  });

  it("keeps a selected language when a stale server render is replayed", async () => {
    const serverData = { locale: Locale.EN, dict: { Language: "Language" } };
    const { rerender } = render(
      <I18nRootProvider initialLocaleData={serverData}>
        <TranslationProbe />
      </I18nRootProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(screen.getByText("ga:Teanga")).toBeTruthy());

    // router.refresh() and prefetched payloads hand back a fresh object that
    // still carries the locale from before the selection was persisted.
    rerender(
      <I18nRootProvider initialLocaleData={{ ...serverData }}>
        <TranslationProbe />
      </I18nRootProvider>,
    );

    expect(screen.getByText("ga:Teanga")).toBeTruthy();
  });

  it("adopts a new server locale while the visitor has made no choice", async () => {
    const { rerender } = render(
      <I18nRootProvider
        initialLocaleData={{ locale: Locale.EN, dict: { Language: "Language" } }}
      >
        <TranslationProbe />
      </I18nRootProvider>,
    );

    rerender(
      <I18nRootProvider
        initialLocaleData={{ locale: Locale.FR_FR, dict: { Language: "Langue" } }}
      >
        <TranslationProbe />
      </I18nRootProvider>,
    );

    await waitFor(() => expect(screen.getByText("fr-FR:Langue")).toBeTruthy());
  });
});

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
    pathname = "/settings";
    document.cookie = "ogma-locale=; path=/; max-age=0";
    localStorage.clear();
  });

  afterEach(() => {
    pathname = "/about";
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
          expect.objectContaining({
            body: JSON.stringify({ locale: Locale.GA }),
          }),
        ],
      ]),
    );
    await waitFor(() => expect(screen.getByText(Locale.GA)).toBeTruthy());
  });

  it("reports a failed account adoption instead of treating it as saved", async () => {
    document.cookie = "ogma-locale=ga; path=/";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ theme: "system" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 503 }),
    );

    try {
      renderWithServerLocale(Locale.EN);

      // the warning is the only place a failed adoption is observable
      await waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          "Failed to adopt the browser language preference:",
          expect.objectContaining({ message: "settings API returned 503" }),
        ),
      );
      await waitFor(() => expect(screen.getByText(Locale.GA)).toBeTruthy());
    } finally {
      warn.mockRestore();
    }
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
