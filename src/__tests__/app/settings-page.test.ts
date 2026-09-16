// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CourseVisibilityItem = {
  courseId: string;
  courseName: string;
  isActive: boolean;
  contextText: string | null;
  hasDueItems: boolean;
};

type CourseVisibilityManagerProps = {
  items: CourseVisibilityItem[];
  onToggleCourse: (item: CourseVisibilityItem, active: boolean) => Promise<void>;
  onRestoreAll: (items: CourseVisibilityItem[]) => Promise<void>;
  inline: boolean;
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const setSettings = vi.fn();
  const fetchSettings = vi.fn().mockResolvedValue(undefined);
  const archiveCourse = vi.fn().mockResolvedValue(undefined);
  const unarchiveCourse = vi.fn().mockResolvedValue(undefined);

  return {
    setSettings,
    fetchSettings,
    archiveCourse,
    unarchiveCourse,
    logout: vi.fn(),
    resetWorkspaceClientState: vi.fn(async (_userId: string | null) => {}),
    publishWorkspaceInvalidation: vi.fn(),
    postNativeOfflineAccount: vi.fn(),
    treeState: {
      ownerUserId: "user-1" as string | null,
      generation: 1,
    },
    toastError: vi.fn(),
    lastManagerProps: null as CourseVisibilityManagerProps | null,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/components/navigation/mobile-bottom-navigation", () => ({
  default: () => null,
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) =>
    React.lazy(loader),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      Object.entries(params ?? {}).reduce(
        (translated, [name, value]) =>
          translated.replaceAll(`{${name}}`, String(value)),
        key,
      ),
  }),
}));

vi.mock("@/lib/notes/state/ui/settings", () => ({
  useSettingsStore: () => ({
    settings: null,
    setSettings: mocks.setSettings,
  }),
}));

vi.mock("@/lib/notes/state/courses.zustand", () => ({
  default: () => ({
    settings: [],
    fetchSettings: mocks.fetchSettings,
    archiveCourse: mocks.archiveCourse,
    unarchiveCourse: mocks.unarchiveCourse,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
  },
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

vi.mock("@/lib/notes/state/tree", () => ({
  default: { getState: () => mocks.treeState },
}));

vi.mock("@/lib/native-app", () => ({
  postNativeUpdates: vi.fn(),
  postNativeOfflineAccount: mocks.postNativeOfflineAccount,
  useNativeAppBridge: () => null,
}));

vi.mock("@/components/settings/account-section", () => ({
  default: () =>
    React.createElement("section", { id: "account" }, "Personal Information"),
}));

vi.mock("@/components/settings/editor-theme-section", () => ({
  default: () =>
    React.createElement("section", { id: "editor" }, "Editor & Theme"),
}));

vi.mock("@/components/settings/password-section", () => ({
  default: () => React.createElement("section", { id: "password" }, "Password"),
}));

vi.mock("@/components/settings/canvas-section", () => ({
  default: () => React.createElement("section", { id: "canvas" }, "Canvas"),
}));

vi.mock("@/components/settings/ai-section", () => ({
  default: () => React.createElement("section", { id: "ai" }, "AI Settings"),
}));

vi.mock("@/components/settings/data-export-section", () => ({
  default: () =>
    React.createElement("section", { id: "data" }, "Data & Export"),
}));

vi.mock("@/components/settings/danger-section", () => ({
  default: () =>
    React.createElement("section", { id: "danger" }, "Danger Zone"),
}));

vi.mock("@/components/course-visibility/course-visibility-manager", () => ({
  default: (props: CourseVisibilityManagerProps) => {
    mocks.lastManagerProps = props;
    return React.createElement(
      "section",
      { id: "course-visibility" },
      "Course visibility controls",
    );
  },
  mergeCourseVisibilityItems: (sources: CourseVisibilityItem[]) =>
    sources.map((source) => ({
      courseId: source.courseId,
      courseName: source.courseName,
      isActive: source.isActive ?? true,
      contextText: source.contextText ?? null,
      hasDueItems: source.hasDueItems,
    })),
}));

import SettingsPage from "@/app/settings/page";

function okJson(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function renderSettingsPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(SettingsPage));
  });

  return { container, root };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    mocks.lastManagerProps = null;
    mocks.treeState.ownerUserId = "user-1";
    mocks.treeState.generation = 1;
    mocks.logout.mockResolvedValue(okJson({}));
    mocks.resetWorkspaceClientState.mockImplementation(async (userId) => {
      mocks.treeState.ownerUserId = userId;
      mocks.treeState.generation += 1;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "/api/auth/me") {
          return Promise.resolve(
            okJson({ user: { name: "Jane Doe", email: "jane@example.com" } }),
          );
        }

        if (url === "/api/settings") {
          return Promise.resolve(
            okJson({
              theme: "dark",
              editorsize: "large",
              timezone: "UTC",
            }),
          );
        }

        if (url === "/api/quiz/dashboard/courses?includeArchived=1") {
          return Promise.resolve(
            okJson({
              courses: [
                {
                  courseId: "7",
                  courseName: "Algorithms",
                  dueCount: 2,
                  totalCards: 10,
                },
              ],
            }),
          );
        }

        if (url === "/api/auth/logout") return mocks.logout();

        throw new Error(`Unhandled fetch: ${url}`);
      }),
    );
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("keeps the existing settings sections while adding course visibility controls", async () => {
    const { container } = await renderSettingsPage();

    await vi.waitFor(() => {
      expect(mocks.setSettings).toHaveBeenCalledTimes(1);
      expect(mocks.fetchSettings).toHaveBeenCalledTimes(1);
      expect(mocks.lastManagerProps).not.toBeNull();
    });

    expect(container.textContent).toContain("Personal Information");
    expect(container.textContent).toContain("Editor & Theme");
    expect(container.textContent).toContain("Password");
    expect(container.textContent).toContain("Canvas");
    expect(container.textContent).toContain("AI Settings");
    expect(container.textContent).toContain("Data & Export");
    expect(container.textContent).toContain("Danger Zone");
    expect(container.textContent).toContain("Course visibility");
    expect(container.textContent).toContain("Course visibility controls");
    expect(mocks.lastManagerProps?.items).toEqual([
      {
        courseId: "7",
        courseName: "Algorithms",
        isActive: true,
        contextText: "2 due · 10 cards",
        hasDueItems: true,
      },
    ]);
  });

  it("publishes a server-confirmed logout when local cleanup fails", async () => {
    mocks.resetWorkspaceClientState.mockImplementationOnce(async (userId) => {
      mocks.treeState.ownerUserId = userId;
      mocks.treeState.generation += 1;
      throw new Error("IndexedDB unavailable");
    });
    const { container } = await renderSettingsPage();
    await vi.waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledOnce());
    const signOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Sign out",
    );
    expect(signOut).toBeDefined();

    await act(async () => signOut?.click());

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(mocks.resetWorkspaceClientState).toHaveBeenCalledWith(null);
    expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
      "user-1",
      "session",
    );
  });

  it("does not publish when the server rejects logout", async () => {
    mocks.logout.mockResolvedValueOnce({ ok: false, status: 500 });
    const { container } = await renderSettingsPage();
    await vi.waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledOnce());
    const signOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Sign out",
    );

    await act(async () => signOut?.click());

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(mocks.resetWorkspaceClientState).not.toHaveBeenCalled();
    expect(mocks.publishWorkspaceInvalidation).not.toHaveBeenCalled();
  });

  it("publishes a late logout for its original owner without resetting or redirecting the new workspace", async () => {
    let resolveLogout!: (response: { ok: true }) => void;
    mocks.logout.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const originalLocation = window.location.href;
    const { container } = await renderSettingsPage();
    await vi.waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledOnce());
    const signOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Sign out",
    );

    await act(async () => signOut?.click());
    await vi.waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    mocks.treeState.ownerUserId = "user-2";
    mocks.treeState.generation = 2;
    resolveLogout({ ok: true });

    await vi.waitFor(() =>
      expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
        "user-1",
        "session",
      ),
    );
    expect(mocks.resetWorkspaceClientState).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalledWith("ogma-theme");
    expect(window.location.href).toBe(originalLocation);
  });

  it("does not finish an old logout after another workspace takes over during cleanup", async () => {
    let finishCleanup!: () => void;
    mocks.resetWorkspaceClientState.mockImplementationOnce(async () => {
      mocks.treeState.ownerUserId = null;
      mocks.treeState.generation = 2;
      await new Promise<void>((resolve) => {
        finishCleanup = resolve;
      });
    });
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const originalLocation = window.location.href;
    const { container } = await renderSettingsPage();
    await vi.waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledOnce());
    const signOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Sign out",
    );

    await act(async () => signOut?.click());
    await vi.waitFor(() =>
      expect(mocks.publishWorkspaceInvalidation).toHaveBeenCalledWith(
        "user-1",
        "session",
      ),
    );
    mocks.treeState.ownerUserId = "user-2";
    mocks.treeState.generation = 3;
    finishCleanup();

    await act(async () => Promise.resolve());
    expect(removeItem).not.toHaveBeenCalledWith("ogma-theme");
    expect(window.location.href).toBe(originalLocation);
  });
});
