// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import german from "@/locales/de-DE.json";

const mocks = vi.hoisted(() => ({
  locale: "en",
  register: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("next-auth/react", () => ({
  getProviders: vi.fn().mockResolvedValue({}),
  signIn: vi.fn(),
}));
vi.mock("@/lib/apiClient", () => ({
  register: mocks.register,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string) =>
      mocks.locale === "de"
        ? ((german as Record<string, string>)[key] ?? key)
        : key,
  }),
}));
vi.mock("@/lib/marketing/client", () => ({
  getMarketingContext: () => ({}),
  trackMarketingEvent: vi.fn(),
}));
vi.mock("@/lib/native-app", () => ({
  useNativeAppBridge: () => null,
  postNativeOAuth: () => false,
}));
vi.mock("@/components/brand-logo", () => ({
  default: () => <span>OghmaNotes</span>,
}));

import RegisterPage from "@/app/register/page";

function fillForm(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "student@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("registration password feedback", () => {
  beforeEach(() => {
    mocks.locale = "en";
    mocks.register.mockReset();
    mocks.replace.mockReset();
    window.history.replaceState(null, "", "/register");
  });

  it("does not mark any password rule complete before typing", () => {
    render(<RegisterPage />);

    expect(
      screen.getByText("No more than 128 characters").parentElement?.textContent,
    ).toContain("○");
  });

  it.each([
    ["Short1", "Password must be at least 8 characters long"],
    ["alllowercase1", "Password must contain at least one uppercase letter"],
    ["ALLUPPERCASE1", "Password must contain at least one lowercase letter"],
    ["NoNumbersHere", "Password must contain at least one number"],
  ])("shows a specific password error for %s", (password, message) => {
    render(<RegisterPage />);
    fillForm(password);

    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("shows the mismatch beside confirmation", () => {
    render(<RegisterPage />);
    fillForm("StrongPass1", "StrongPass2");

    expect(screen.getByText("Passwords do not match")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("submits a valid password and carries delivery state to verification", async () => {
    mocks.register.mockResolvedValue({
      requiresVerification: true,
      emailDelivery: "queued",
    });
    render(<RegisterPage />);
    fillForm("StrongPass1");

    await waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith(
      "/verify-email?email=student%40example.com&delivery=queued",
    );
  });

  it("offers the resend path after an existing-account retry", async () => {
    mocks.register.mockRejectedValue(
      Object.assign(new Error("User already exists"), { status: 409 }),
    );
    render(<RegisterPage />);
    fillForm("StrongPass1");

    const resend = await screen.findByRole("link", {
      name: "Resend verification email",
    });
    expect(resend.getAttribute("href")).toBe(
      "/verify-email?email=student%40example.com",
    );
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Password", { exact: true }).getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText("Password is required")).toBeNull();
  });

  it("shows the active rules and error in German", () => {
    mocks.locale = "de";
    render(<RegisterPage />);

    expect(screen.getByText("Ein Großbuchstabe")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "student@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Passwort", { exact: true }), {
      target: { value: "alllowercase1" },
    });
    fireEvent.change(screen.getByLabelText("Passwort bestätigen"), {
      target: { value: "alllowercase1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto erstellen" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Das Passwort muss mindestens einen Großbuchstaben enthalten",
    );
  });
});
