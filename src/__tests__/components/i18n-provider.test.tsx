// @vitest-environment jsdom

import { useContext, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import I18nProvider, { I18nContext } from "@/lib/i18n/provider";
import { Locale } from "@/locales";

function Translation({ label }: { label: string }) {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error("Missing I18nProvider");

  const { t } = i18n;
  return <span data-testid={label}>{t("Settings")}</span>;
}

function NestedProviderFixture() {
  const [, setTick] = useState(0);

  return (
    <I18nProvider locale={Locale.EN} lngDict={{ Settings: "Settings" }}>
      <button type="button" onClick={() => setTick((tick) => tick + 1)}>
        Rerender outer provider
      </button>
      <Translation label="outer" />
      <I18nProvider locale={Locale.GA} lngDict={{ Settings: "Socruithe" }}>
        <Translation label="inner" />
      </I18nProvider>
    </I18nProvider>
  );
}

describe("I18nProvider", () => {
  it("keeps independent dictionaries when an outer provider rerenders", () => {
    render(<NestedProviderFixture />);

    expect(screen.getByTestId("outer").textContent).toBe("Settings");
    expect(screen.getByTestId("inner").textContent).toBe("Socruithe");

    fireEvent.click(
      screen.getByRole("button", { name: "Rerender outer provider" }),
    );

    expect(screen.getByTestId("outer").textContent).toBe("Settings");
    expect(screen.getByTestId("inner").textContent).toBe("Socruithe");
  });
});
