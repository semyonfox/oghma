// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetWorkspaceClientState: vi.fn(async (userId: string | null) => {
    mocks.treeState.ownerUserId = userId;
    mocks.treeState.generation += 1;
  }),
  treeState: {
    ownerUserId: "user-1" as string | null,
    generation: 1,
  },
  push: vi.fn(),
  toast: {
    success: vi.fn(),
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

vi.mock("@/lib/notes/state/tree", () => ({
  default: { getState: () => mocks.treeState },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import DangerSection from "@/components/settings/danger-section";

function invalidation(userId: string, scope: "vault" | "session"): unknown {
  const stored = localStorage.getItem(`oghmaNotes-workspace-invalidation:${userId}:${scope}`);
  return stored === null ? null : JSON.parse(stored);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("DangerSection workspace lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("BroadcastChannel", undefined);
    localStorage.clear();
    mocks.treeState.ownerUserId = "user-1";
    mocks.treeState.generation = 1;
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

  it("fences the local workspace before announcing a successful vault clear", async () => {
    let finishCleanup!: () => void;
    mocks.resetWorkspaceClientState.mockImplementationOnce((userId) => {
      expect(invalidation("user-1", "vault")).toBeNull();
      mocks.treeState.ownerUserId = userId;
      mocks.treeState.generation += 1;
      return new Promise<void>((resolve) => { finishCleanup = resolve; });
    });
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(invalidation("user-1", "vault")).toMatchObject({ userId: "user-1", scope: "vault" }));
    expect(mocks.treeState.generation).toBe(2);
    expect(mocks.toast.success).not.toHaveBeenCalled();

    finishCleanup();
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledOnce());
  });

  it("notifies tabs after a server-confirmed vault clear when local cleanup fails", async () => {
    mocks.resetWorkspaceClientState.mockImplementationOnce(async (userId) => {
      mocks.treeState.ownerUserId = userId;
      mocks.treeState.generation += 1;
      throw new Error("IndexedDB unavailable");
    });
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledOnce());
    expect(invalidation("user-1", "vault")).toMatchObject({ userId: "user-1", scope: "vault" });
  });

  it("notifies tabs after server-confirmed account deletion when local cleanup fails", async () => {
    mocks.resetWorkspaceClientState.mockImplementationOnce(async (userId) => {
      mocks.treeState.ownerUserId = userId;
      mocks.treeState.generation += 1;
      throw new Error("IndexedDB unavailable");
    });
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByPlaceholderText("delete my account"), {
      target: { value: "delete my account" },
    });
    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete my account",
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledOnce());
    expect(mocks.treeState.ownerUserId).toBeNull();
    expect(invalidation("user-1", "session")).toMatchObject({ userId: "user-1", scope: "session" });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not notify tabs when the server rejects the vault clear", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledOnce());
    expect(mocks.treeState.generation).toBe(1);
    expect(invalidation("user-1", "vault")).toBeNull();
  });

  it("notifies tabs before parsing a malformed success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("truncated", { status: 200 })),
    );
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledOnce());
    expect(mocks.treeState.generation).toBe(2);
    expect(invalidation("user-1", "vault")).toMatchObject({ userId: "user-1", scope: "vault" });
  });

  it("publishes a late vault clear for its original owner without resetting the new workspace", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Clear vault" }));
    fireEvent.change(screen.getByPlaceholderText("Type the phrase above..."), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    mocks.treeState.ownerUserId = "user-2";
    mocks.treeState.generation = 2;
    resolveRequest(
      new Response(
        JSON.stringify({
          summary: { notesDeleted: 2, s3FilesDeleted: 1 },
        }),
        { status: 200 },
      ),
    );

    await waitFor(() =>
      expect(invalidation("user-1", "vault")).toMatchObject({ userId: "user-1", scope: "vault" }),
    );
    expect(mocks.treeState).toEqual({ ownerUserId: "user-2", generation: 2 });
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("publishes a late account deletion for its original owner without resetting or redirecting the new workspace", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(<DangerSection />);
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByPlaceholderText("delete my account"), {
      target: { value: "delete my account" },
    });
    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete my account",
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    mocks.treeState.ownerUserId = "user-2";
    mocks.treeState.generation = 2;
    resolveRequest(new Response(null, { status: 200 }));

    await waitFor(() =>
      expect(invalidation("user-1", "session")).toMatchObject({ userId: "user-1", scope: "session" }),
    );
    expect(mocks.treeState).toEqual({ ownerUserId: "user-2", generation: 2 });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
