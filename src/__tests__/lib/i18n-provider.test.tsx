// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import I18nProvider from "@/lib/i18n/provider";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale } from "@/locales";

function TranslationProbe() {
  const { activeLocale, locale, t } = useI18n();

  return (
    <>
      <output data-testid="locale">{activeLocale}</output>
      <output data-testid="translation">{t("Greeting {name}", { name: "Ada" })}</output>
      <button
        type="button"
        onClick={() =>
          locale(Locale.GA, { "Greeting {name}": "Dia duit {name}" })
        }
      >
        Switch locale
      </button>
    </>
  );
}

describe("I18nProvider", () => {
  it("interpolates its initial dictionary and changes locale without touching another provider", () => {
    render(
      <>
        <I18nProvider
          locale={Locale.FR_FR}
          lngDict={{ "Greeting {name}": "Bonjour {name}" }}
        >
          <TranslationProbe />
        </I18nProvider>
        <I18nProvider
          locale={Locale.EN}
          lngDict={{ "Greeting {name}": "Hello {name}" }}
        >
          <div data-testid="independent">Independent provider</div>
        </I18nProvider>
      </>,
    );

    expect(screen.getByTestId("locale").textContent).toBe(Locale.FR_FR);
    expect(screen.getByTestId("translation").textContent).toBe("Bonjour Ada");

    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));

    expect(screen.getByTestId("locale").textContent).toBe(Locale.GA);
    expect(screen.getByTestId("translation").textContent).toBe("Dia duit Ada");
    expect(screen.getByTestId("independent").textContent).toBe(
      "Independent provider",
    );
  });

  it("accepts a later authoritative dictionary from its parent", async () => {
    const view = render(
      <I18nProvider
        locale={Locale.EN}
        lngDict={{ "Greeting {name}": "Hello {name}" }}
      >
        <TranslationProbe />
      </I18nProvider>,
    );

    view.rerender(
      <I18nProvider
        locale={Locale.FR_FR}
        lngDict={{ "Greeting {name}": "Bonjour {name}" }}
      >
        <TranslationProbe />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe(Locale.FR_FR);
      expect(screen.getByTestId("translation").textContent).toBe(
        "Bonjour Ada",
      );
    });
  });
});
