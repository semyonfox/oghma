// @vitest-environment jsdom

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Invalidation = {
    scope: "tree" | "vault" | "session";
    userId: string;
    revision: number;
    sourceId: string;
  };

  return {
    pathname: "/notes",
    reconcile: vi.fn(async () => false),
    reset: vi.fn(async () => {}),
    refreshTree: vi.fn(async () => {}),
    invalidationListener: null as ((event: Invalidation) => void) | null,
    treeState: {
      ownerUserId: "user-1" as string | null,
      treeAPI: {} as object | null,
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (value: string) => value }),
}));
vi.mock("@/lib/notes/workspace-lifecycle", () => ({
  reconcileWorkspaceSession: mocks.reconcile,
  resetWorkspaceClientState: mocks.reset,
}));
vi.mock("@/lib/notes/workspace-invalidation", () => ({
  subscribeToWorkspaceInvalidations: vi.fn(
    (_userId: string, listener: NonNullable<typeof mocks.invalidationListener>) => {
      mocks.invalidationListener = listener;
      return () => {
        mocks.invalidationListener = null;
      };
    },
  ),
}));
vi.mock("@/lib/notes/state/tree", () => ({
  default: {
    getState: () => ({
      ...mocks.treeState,
      refreshTree: mocks.refreshTree,
    }),
  },
}));

import WorkspaceLifecycleProvider from "@/components/providers/workspace-lifecycle-provider";

function authResponse(userId: string) {
  return new Response(JSON.stringify({ user: { user_id: userId } }), {
    status: 200,
  });
}

describe("WorkspaceLifecycleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/notes";
    mocks.treeState.ownerUserId = "user-1";
    mocks.treeState.treeAPI = {};
    mocks.invalidationListener = null;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("keeps the workspace gated with a retry when identity is inconclusive", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

    render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );

    expect(screen.queryByText("private workspace")).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).not.toBeNull();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("gates a new managed entry until the changed account is reconciled", async () => {
    let resolveSecond!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse("user-1"))
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (resolveSecond = resolve)),
      );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );
    await screen.findByText("private workspace");

    mocks.pathname = "/about";
    view.rerender(
      <WorkspaceLifecycleProvider>
        <div>public page</div>
      </WorkspaceLifecycleProvider>,
    );
    mocks.pathname = "/settings/profile";
    view.rerender(
      <WorkspaceLifecycleProvider>
        <div>next private workspace</div>
      </WorkspaceLifecycleProvider>,
    );

    expect(screen.queryByText("next private workspace")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveSecond(authResponse("user-2"));
    await screen.findByText("next private workspace");
    expect(mocks.reconcile).toHaveBeenLastCalledWith("user-2");
  });

  it("preserves a verified session on 503 and skips tree refresh on focus", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse("user-1"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );
    await screen.findByText("private workspace");

    await act(async () => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(mocks.refreshTree).not.toHaveBeenCalled();
    expect(screen.getByText("private workspace")).not.toBeNull();
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("refreshes the tree on focus after verifying the current identity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse("user-1"))
      .mockResolvedValueOnce(authResponse("user-1"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );
    await screen.findByText("private workspace");

    await act(async () => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(mocks.refreshTree).toHaveBeenCalledOnce());
  });

  it("applies a matching vault invalidation without consuming it on an auth outage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse("user-1"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );
    await screen.findByText("private workspace");
    await waitFor(() => expect(mocks.invalidationListener).not.toBeNull());

    await act(async () => {
      mocks.invalidationListener?.({
        scope: "vault",
        userId: "user-1",
        revision: Date.now(),
        sourceId: "other-tab",
      });
    });

    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("user-1"));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not refresh the tree for an invalidation when identity verification fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse("user-1"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceLifecycleProvider>
        <div>private workspace</div>
      </WorkspaceLifecycleProvider>,
    );
    await screen.findByText("private workspace");
    await waitFor(() => expect(mocks.invalidationListener).not.toBeNull());

    await act(async () => {
      mocks.invalidationListener?.({
        scope: "tree",
        userId: "user-1",
        revision: Date.now(),
        sourceId: "other-tab",
      });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(mocks.refreshTree).not.toHaveBeenCalled();
  });
});
