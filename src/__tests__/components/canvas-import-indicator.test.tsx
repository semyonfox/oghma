// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: {
    progress: {
      total: 120,
      completed: 50,
      percent: 42,
      forbidden: 0,
      error: 0,
      failed: false,
    },
    isImporting: true,
    showToast: true,
    onToastClose: vi.fn(),
  },
}));
vi.mock("@/components/canvas/canvas-import-notifications", () => ({
  useCanvasImportNotification: () => mocks.status,
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
import CanvasImportIndicator from "@/components/canvas/canvas-import-indicator";

describe("Canvas import sidebar indicator", () => {
  beforeEach(() => {
    mocks.status.isImporting = true;
    mocks.status.showToast = true;
    mocks.status.progress.failed = false;
    mocks.status.progress.percent = 42;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("opens progress details without dismissing the running import", async () => {
    render(<CanvasImportIndicator />);
    fireEvent.click(
      screen.getByRole("button", { name: /canvas.import.importing/ }),
    );
    expect(
      (await screen.findByRole("progressbar")).getAttribute("aria-valuenow"),
    ).toBe("42");
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/settings#canvas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.status.onToastClose).not.toHaveBeenCalled();
  });

  it("keeps the import control mounted when idle and removes its ring", () => {
    mocks.status.isImporting = false;
    mocks.status.showToast = false;
    render(<CanvasImportIndicator />);
    const button = screen.getByRole("button", { name: "Canvas course import" });
    expect(button.querySelector("circle")).toBeNull();
  });

  it("keeps a failed job visible until explicitly acknowledged", async () => {
    mocks.status.isImporting = false;
    mocks.status.progress.failed = true;
    render(<CanvasImportIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Import failed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(mocks.status.onToastClose).toHaveBeenCalledOnce();
  });
});
