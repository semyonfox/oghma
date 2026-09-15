// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  resetWorkspaceClientState: vi.fn(async () => {
    mocks.order.push("reset");
  }),
  publishWorkspaceInvalidation: vi.fn(() => {
    mocks.order.push("publish");
  }),
  push: vi.fn(),
  toast: {
    success: vi.fn(() => mocks.order.push("toast")),
    error: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (value: string) => value }),
}));

vi.mock("@/components/providers/workspace-lifecycle-provider", () => ({
  useWorkspaceSession: () => ({ userId: "user-1", ready: true }),
}));

vi.mock("@/lib/notes/workspace-lifecycle", () => ({
  resetWorkspaceClientState: mocks.resetWorkspaceClientState,
}));

vi.mock("@/lib/notes/workspace-invalidation", () => ({
  publishWorkspaceInvalidation: mocks.publishWorkspaceInvalidation,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import DangerSection from "@/components/settings/danger-section";

describe("DangerSection workspace lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            summary: { notesDeleted: 2, s3FilesDeleted: 1 },
          }),
          { status: 200 },
        ),
      ),
    );
  });

  it("clears local state before notifying tabs and showing success", async () => {
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledOnce());
    expect(mocks.resetWorkspaceClientState).toHaveBeenCalledWith("user-1");
    expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
      "user-1",
      "vault",
    );
    expect(mocks.order).toEqual(["reset", "publish", "toast"]);
  });
});
