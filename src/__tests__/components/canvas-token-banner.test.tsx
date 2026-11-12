// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
import CanvasTokenBanner from "@/components/canvas/canvas-token-banner";

const tokenState = (body: { connected: boolean; invalidSince: string | null }) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("canvas token banner", () => {
  it("asks to reconnect when canvas rejected the stored token", async () => {
    vi.stubGlobal("fetch", tokenState({ connected: true, invalidSince: "2026-11-08T10:00:00.000Z" }));
    render(<CanvasTokenBanner />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reconnect" }).getAttribute("href")).toBe("/settings#canvas");
  });

  it("stays hidden while the token is fine or canvas is not connected", async () => {
    const healthy = tokenState({ connected: true, invalidSince: null });
    vi.stubGlobal("fetch", healthy);
    const { unmount } = render(<CanvasTokenBanner />);
    await vi.waitFor(() => expect(healthy).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();

    vi.stubGlobal("fetch", tokenState({ connected: false, invalidSince: "2026-11-08T10:00:00.000Z" }));
    render(<CanvasTokenBanner />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("only hides the dismissed rejection, a later one shows again", async () => {
    vi.stubGlobal("fetch", tokenState({ connected: true, invalidSince: "2026-11-08T10:00:00.000Z" }));
    const first = render(<CanvasTokenBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    first.unmount();

    render(<CanvasTokenBanner />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();

    vi.stubGlobal("fetch", tokenState({ connected: true, invalidSince: "2026-11-09T08:00:00.000Z" }));
    render(<CanvasTokenBanner />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
