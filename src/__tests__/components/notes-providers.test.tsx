// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import I18nProvider from "@/lib/i18n/provider";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale } from "@/locales";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

function TranslationProbe() {
  const { activeLocale, t } = useI18n();
  return <output>{`${activeLocale}:${t("Notes")}`}</output>;
}

import NotesProviders from "@/components/notes/notes-providers";

describe("NotesProviders", () => {
  it("uses the root locale and does not refetch settings for the notes route", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <I18nProvider locale={Locale.GA} lngDict={{ Notes: "Nótaí" }}>
        <NotesProviders>
          <TranslationProbe />
        </NotesProviders>
      </I18nProvider>,
    );

    expect(screen.getByText("ga:Nótaí")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
