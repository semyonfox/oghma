// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import I18nProvider from "@/lib/i18n/provider";
import { translate } from "@/lib/i18n/translate";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale } from "@/locales";
import en from "@/locales/en.json";

const partialIrish = { Settings: "Socruithe" };

function Probe({ messageKey }: { messageKey: string }) {
  const { t } = useI18n();
  return <output data-testid="probe">{t(messageKey)}</output>;
}

describe("translate", () => {
  it("falls back to the English value, not the raw key, when a locale lacks it", () => {
    expect(en["blog.title"]).toBe("Our Blog");
    expect(translate(partialIrish, "blog.title")).toBe("Our Blog");
    expect(translate(partialIrish, "Settings")).toBe("Socruithe");
    expect(translate(partialIrish, "Not a catalog key")).toBe("Not a catalog key");
  });

  it("leaves a placeholder visible instead of throwing when no value is passed", () => {
    expect(translate({}, "{count} pages")).toBe("{count} pages");
    expect(translate({}, "{count} pages", { count: 3 })).toBe("3 pages");
  });

  it("does not resolve inherited object keys as translations", () => {
    expect(translate({}, "constructor")).toBe("constructor");
    expect(translate({}, "__proto__")).toBe("__proto__");
  });

  it("renders the same text on the client as the server helper", () => {
    render(
      <I18nProvider locale={Locale.GA} lngDict={partialIrish}>
        <Probe messageKey="blog.title" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe(
      translate(partialIrish, "blog.title"),
    );
  });
});
