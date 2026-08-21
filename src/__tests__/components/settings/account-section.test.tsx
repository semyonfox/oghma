// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateSettings: vi.fn(),
  applyLocale: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

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
  const state = { updateSettings: mocks.updateSettings };

  return {
    ...actual,
    // Callers use both the selector and whole-store forms of the hook.
    useSettingsStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

import AccountSection, {
  type FormState,
} from "@/components/settings/account-section";
import { Locale } from "@/locales";

const savedState: FormState = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  timezone: "UTC",
  theme: "system",
  editorWidth: "default",
  locale: Locale.EN,
};

function Harness({ onSaved }: { onSaved?: (profile: unknown) => void }) {
  const [formState, setFormState] = useState<FormState>(savedState);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  return (
    <AccountSection
      formState={formState}
      setFormState={setFormState}
      savingSection={savingSection}
      setSavingSection={setSavingSection}
      hasChanges={formState.locale !== savedState.locale}
      onSaved={onSaved}
    />
  );
}

describe("AccountSection language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    mocks.updateSettings.mockResolvedValue({ locale: Locale.GA });
  });

  it("defers the language change to the section's Save button", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: Locale.GA },
    });

    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(mocks.applyLocale).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText("Unsaved")).toBeTruthy(),
    );
  });

  it("saves the language with the profile and only then switches the UI", async () => {
    const onSaved = vi.fn();
    render(<Harness onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: Locale.GA },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        firstName: "Jane",
        lastName: "Doe",
        timezone: "UTC",
        locale: Locale.GA,
      }),
    );

    await waitFor(() => {
      expect(mocks.applyLocale).toHaveBeenCalledWith(
        Locale.GA,
        expect.any(Object),
      );
      expect(mocks.refresh).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ locale: Locale.GA }),
    );
  });

  it("leaves the UI language alone when the save fails", async () => {
    mocks.updateSettings.mockRejectedValue(new Error("nope"));
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: Locale.GA },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Failed to save profile"),
    );
    expect(mocks.applyLocale).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
