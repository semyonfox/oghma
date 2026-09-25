// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FirstLoginWelcome from "@/components/notes/first-login-welcome";

const mocks = vi.hoisted(() => ({
  pathname: "/notes",
  router: { push: vi.fn(), replace: vi.fn() },
}));
const noteId = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/providers/workspace-lifecycle-provider", () => ({
  useWorkspaceSession: () => ({ userId: "new-user", ready: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/notes";
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
    ["Connect Canvas", "/settings#canvas"],
    ["Read Getting Started", `/notes/${noteId}`],
  ])("dismisses before navigating through %s", async (action, destination) => {
    const fetchMock = stubWelcome(noteId);
    render(<FirstLoginWelcome />);

    const dialog = await screen.findByRole("dialog", { name: "Welcome to OghmaNotes" });
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/notes/${noteId}`),
    );
    fireEvent.click(screen.getByRole("button", { name: action }));

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith(destination));
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
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the current note when the user arrives on a note link", async () => {
    mocks.pathname = `/notes/${noteId}`;
    stubWelcome(noteId);
    render(<FirstLoginWelcome />);

    await screen.findByRole("dialog", { name: "Welcome to OghmaNotes" });
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
