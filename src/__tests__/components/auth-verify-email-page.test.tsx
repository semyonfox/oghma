// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VerifyEmailPage from "@/app/verify-email/page";
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({ token: "synthetic-verification" }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (text: string) => text }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requires an explicit owner password instead of verifying on navigation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: "Choose a strong password" }, { status: 400 }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<VerifyEmailPage />);
  const password = await screen.findByLabelText("New password");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(password, { target: { value: "MailboxOwner123" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  await screen.findByText("Choose a strong password");
  expect(fetch).toHaveBeenCalledWith(
    "/api/auth/verify-email",
    expect.objectContaining({
      body: '{"token":"synthetic-verification","password":"MailboxOwner123"}',
    }),
  );
});
