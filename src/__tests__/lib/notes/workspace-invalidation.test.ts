// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  publishWorkspaceInvalidation,
  subscribeToWorkspaceInvalidations,
} from "@/lib/notes/workspace-invalidation";

describe("workspace invalidation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  it("publishes only identity and coordination metadata", () => {
    publishWorkspaceInvalidation("user-1", "tree");

    const entries = Object.entries(localStorage);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0][1])).toMatchObject({
      version: 1,
      userId: "user-1",
      scope: "tree",
    });
    expect(entries[0][1]).not.toContain("content");
  });

  it("ignores other users and catches up from storage on focus", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWorkspaceInvalidations("user-1", listener);

    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-2:vault",
      JSON.stringify({
        version: 1,
        userId: "user-2",
        scope: "vault",
        revision: 1,
        sourceId: "other-tab",
      }),
    );
    window.dispatchEvent(new Event("focus"));
    expect(listener).not.toHaveBeenCalled();

    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-1:vault",
      JSON.stringify({
        version: 1,
        userId: "user-1",
        scope: "vault",
        revision: 2,
        sourceId: "other-tab",
      }),
    );
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", scope: "vault" }),
    );
    unsubscribe();
  });

  it("does not replay an invalidation left by an earlier page load", () => {
    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-1:vault",
      JSON.stringify({
        version: 1,
        userId: "user-1",
        scope: "vault",
        revision: 1,
        sourceId: "closed-tab",
      }),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToWorkspaceInvalidations("user-1", listener);

    window.dispatchEvent(new Event("focus"));

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("delivers an invalidation stored after this document started", () => {
    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-1:vault",
      JSON.stringify({
        version: 1,
        userId: "user-1",
        scope: "vault",
        revision: Date.now() * 1000 + 999,
        sourceId: "other-tab",
      }),
    );
    const listener = vi.fn();

    const unsubscribe = subscribeToWorkspaceInvalidations("user-1", listener);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "vault", userId: "user-1" }),
    );
    unsubscribe();
  });

  it("retains a missed vault reset when a later tree update is published", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWorkspaceInvalidations("user-1", listener);
    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-1:vault",
      JSON.stringify({
        version: 1,
        userId: "user-1",
        scope: "vault",
        revision: 10,
        sourceId: "other-tab",
      }),
    );
    localStorage.setItem(
      "oghmaNotes-workspace-invalidation:user-1:tree",
      JSON.stringify({
        version: 1,
        userId: "user-1",
        scope: "tree",
        revision: 11,
        sourceId: "other-tab",
      }),
    );

    window.dispatchEvent(new Event("focus"));

    expect(listener.mock.calls.map(([event]) => event.scope)).toEqual([
      "tree",
      "vault",
    ]);
    unsubscribe();
  });
});
