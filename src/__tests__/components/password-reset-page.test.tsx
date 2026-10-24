// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PasswordResetPage } from "@/components/auth/password-reset-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ token: "a".repeat(64) }),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (text: string) => text }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit(password: string) {
  fireEvent.change(screen.getByLabelText("New Password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
}

it("names the unmet password rule before calling the server", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<PasswordResetPage />);

  submit("lowercase1");

  await screen.findByText("Password must contain at least one uppercase letter");
  expect(fetch).not.toHaveBeenCalled();
});

// regression: the route used to answer with an errors object the page tried to
// .join(), which threw and replaced every server message with a generic one
it("shows the server's error message", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Invalid or expired reset token" }, { status: 400 }),
      ),
  );
  render(<PasswordResetPage />);

  submit("StrongPass1");

  await screen.findByText("Invalid or expired reset token");
});
