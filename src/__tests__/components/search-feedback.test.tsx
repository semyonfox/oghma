// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/notes",
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
import GlobalSearchModal from "@/components/search/global-search-modal";
import useGlobalSearchStore from "@/lib/global-search/state";
const response = (title: string) =>
  new Response(
    JSON.stringify({
      results: {
        notes: [
          {
            id: title,
            type: "note",
            title,
            href: `/notes/${title}`,
            source: "keyword",
          },
        ],
        chats: [],
        quizzes: [],
      },
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  useGlobalSearchStore.setState({ visible: true });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("search recovery", () => {
  it("hides old results immediately while a new query is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response("Old lecture"))
        .mockReturnValue(new Promise(() => {})),
    );
    render(<GlobalSearchModal />);
    await screen.findByRole("option", { name: /Old lecture/ });
    const input = screen.getByRole("combobox", { name: "Search OghmaNotes" });
    fireEvent.change(input, { target: { value: "unrelated-query" } });
    expect(screen.queryByRole("option", { name: /Old lecture/ })).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("shows an error and retries instead of reporting no matches", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("failed", { status: 503 }))
      .mockResolvedValueOnce(response("Recovered lecture"));
    vi.stubGlobal("fetch", request);
    render(<GlobalSearchModal />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "error.something_went_wrong",
    );
    expect(screen.queryByText("No recent results")).toBeNull();
    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: /Recovered lecture/ });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("connects arrow-key selection to the active accessible result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("Lecture")));
    render(<GlobalSearchModal />);
    await screen.findByRole("option", { name: /Lecture/ });
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    const selected = screen
      .getAllByRole("option")
      .find((row) => row.getAttribute("aria-selected") === "true");
    expect(input.getAttribute("aria-activedescendant")).toBe(selected?.id);
    await waitFor(() =>
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled(),
    );
  });
});
