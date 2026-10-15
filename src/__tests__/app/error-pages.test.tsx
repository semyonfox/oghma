// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withI18n } from "@/__tests__/test-utils/i18n";

const session = vi.hoisted(() => ({ validateSession: vi.fn() }));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => sentry);

vi.mock("@/lib/auth/session", () => ({
  validateSession: session.validateSession,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ back: vi.fn() }),
}));

import AppError from "@/app/error";
import NotFound from "@/app/not-found";

afterEach(() => {
  vi.restoreAllMocks();
  session.validateSession.mockReset();
});

describe("app error boundary", () => {
  it("shows a friendly message instead of the raw exception text", () => {
    const reset = vi.fn();
    const error = new Error("Cannot read properties of undefined (reading 'note_id')");

    render(withI18n(<AppError error={error} reset={reset} />));

    expect(screen.getByRole("alert").textContent).not.toContain("note_id");
    expect(screen.getByText("Something unexpected happened. Please try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("not-found page", () => {
  it("links signed-in users back to their notes", async () => {
    session.validateSession.mockResolvedValue({ user_id: "user-1" });

    const page = await NotFound();

    expect(page.props.homeUrl).toBe("/notes");
  });

  it("still renders when session validation is unavailable", async () => {
    session.validateSession.mockRejectedValue(new Error("Unable to verify session"));

    const page = await NotFound();

    expect(page.props.homeUrl).toBe("/");
  });
});
