// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FirstLoginWelcome from "@/components/notes/first-login-welcome";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
const noteId = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/providers/workspace-lifecycle-provider", () => ({
  useWorkspaceSession: () => ({ userId: "new-user", ready: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubWelcome(note: string | null, postOk = true) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ noteId: note }))
    .mockResolvedValueOnce(new Response(null, { status: postOk ? 200 : 503 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("first-login welcome", () => {
  it("does not appear for an existing account", async () => {
    const fetchMock = stubWelcome(null);
    render(<FirstLoginWelcome />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["Open Getting Started", `/notes/${noteId}`],
    ["Connect Canvas", "/settings#canvas"],
  ])("dismisses before navigating through %s", async (action, destination) => {
    const fetchMock = stubWelcome(noteId);
    render(<FirstLoginWelcome />);

    const dialog = await screen.findByRole("dialog", { name: "Welcome to OghmaNotes" });
    fireEvent.click(screen.getByRole("button", { name: action }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(destination));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/onboarding/welcome");
    expect(fetchMock.mock.calls[1][1]).toEqual({ method: "POST" });
    expect(dialog.isConnected).toBe(false);
  });

  it("keeps Skip available and shows a retry message if dismissal fails", async () => {
    const fetchMock = stubWelcome(noteId, false);
    render(<FirstLoginWelcome />);

    await screen.findByRole("dialog", { name: "Welcome to OghmaNotes" });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not save your choice. Try again.",
    );
    expect(screen.getByRole("dialog", { name: "Welcome to OghmaNotes" })).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
