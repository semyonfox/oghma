// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateSettings: vi.fn(),
  applyLocale: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string) => key,
    locale: mocks.applyLocale,
    activeLocale: Locale.EN,
  }),
}));

vi.mock("@/lib/notes/state/ui/settings", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/notes/state/ui/settings")
  >("@/lib/notes/state/ui/settings");

  return {
    ...actual,
    useSettingsStore: () => ({ updateSettings: mocks.updateSettings }),
  };
});

import LanguageSelector from "@/components/common/language-selector";
import { SettingsRequestError } from "@/lib/notes/state/ui/settings";
import { Locale } from "@/locales";

function selectLanguage(value: Locale) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}

describe("LanguageSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSettings.mockResolvedValue({ locale: Locale.GA });
  });

  it("reports the choice without saving when a form owns the save", () => {
    const onSelect = vi.fn();
    render(
      <LanguageSelector
        variant="compact"
        value={Locale.FR_FR}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveProperty("value", Locale.FR_FR);

    selectLanguage(Locale.GA);

    expect(onSelect).toHaveBeenCalledWith(Locale.GA);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.applyLocale).not.toHaveBeenCalled();
  });

  it("applies and saves the choice when no form owns the save", async () => {
    render(<LanguageSelector variant="footer" />);

    selectLanguage(Locale.GA);

    await waitFor(() => {
      expect(mocks.applyLocale).toHaveBeenCalledWith(
        Locale.GA,
        expect.any(Object),
      );
      expect(mocks.updateSettings).toHaveBeenCalledWith({ locale: Locale.GA });
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("keeps the language for signed-out visitors that cannot save an account", async () => {
    mocks.updateSettings.mockRejectedValue(new SettingsRequestError(401));

    render(<LanguageSelector variant="footer" />);

    selectLanguage(Locale.GA);

    await waitFor(() => expect(mocks.applyLocale).toHaveBeenCalled());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("reports a real save failure", async () => {
    mocks.updateSettings.mockRejectedValue(new SettingsRequestError(500));

    render(<LanguageSelector variant="footer" />);

    selectLanguage(Locale.GA);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Failed to save language preference",
      ),
    );
    expect(mocks.applyLocale).toHaveBeenCalled();
  });
});
