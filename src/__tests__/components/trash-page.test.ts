// @vitest-environment jsdom
// The project test glob intentionally accepts .test.ts files only.

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshTree: vi.fn().mockResolvedValue(undefined),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    activeLocale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/notes/state/tree", () => ({
  __esModule: true,
  default: (selector: (state: { refreshTree: typeof mocks.refreshTree }) => unknown) =>
    selector({ refreshTree: mocks.refreshTree }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import TrashPage from "@/components/notes/trash-page";

describe("TrashPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("lists retained roots and restores one through the Trash API", async () => {
    const item = {
      id: "8b9a3521-a2c8-4c21-9f33-a2f835f3e0e8",
      title: "Week 1",
      isFolder: true,
      deletedAt: "2026-08-01T12:00:00.000Z",
      purgeAt: "2099-08-31T12:00:00.000Z",
      originalPath: ["CS101"],
      descendantCount: 3,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

    render(React.createElement(TrashPage));

    expect(await screen.findByText("Week 1")).toBeTruthy();
    expect(screen.getByText("CS101")).toBeTruthy();
    expect(screen.getByText("Contains {count} items")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore: Week 1" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/trash",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "restore", id: item.id }),
        }),
      );
    });
    expect(mocks.refreshTree).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Restore: Week 1");
    await waitFor(() => {
      expect(screen.queryByText("Week 1")).toBeNull();
    });
  });

  it("names a folder and its descendants before permanently deleting it", async () => {
    const item = {
      id: "8b9a3521-a2c8-4c21-9f33-a2f835f3e0e8",
      title: "Week 1",
      isFolder: true,
      deletedAt: "2026-08-01T12:00:00.000Z",
      purgeAt: "2099-08-31T12:00:00.000Z",
      originalPath: [],
      descendantCount: 3,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));

    render(React.createElement(TrashPage));
    await screen.findByText("Week 1");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete permanently: Week 1" }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Delete permanently?")).toBeTruthy();
    expect(screen.getAllByText("Week 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Contains {count} items").length).toBeGreaterThan(1);

    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /^Delete permanently$/,
      }),
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/trash",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "delete", id: item.id }),
        }),
      );
    });
  });

  it("shows expiry urgency and makes Empty Trash explain its scope", async () => {
    const item = {
      id: "8b9a3521-a2c8-4c21-9f33-a2f835f3e0e8",
      title: "Due soon",
      isFolder: false,
      deletedAt: "2026-08-01T12:00:00.000Z",
      purgeAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      originalPath: [],
      descendantCount: 0,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [item] })),
    );

    render(React.createElement(TrashPage));

    expect(
      (await screen.findByText("Permanently deleted in {days} days")).className,
    ).toContain("bg-error-500/10");

    fireEvent.click(screen.getByRole("button", { name: "Empty Trash" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Contains {count} items")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "All items in Trash will be permanently deleted. This cannot be undone.",
      ),
    ).toBeTruthy();
  });
});
