// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/about" }));

import I18nRootProvider from "@/components/providers/i18n-root-provider";
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
