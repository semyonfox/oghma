// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
    lastManagerProps: null as any,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const source = loader.toString();

    if (source.includes("canvas-section")) {
      return function CanvasSection() {
        return React.createElement("section", { id: "canvas" }, "Canvas");
      };
    }

    if (source.includes("ai-section")) {
      return function AISection() {
        return React.createElement("section", { id: "ai" }, "AI Settings");
      };
    }

    if (source.includes("data-export-section")) {
      return function DataExportSection() {
        return React.createElement("section", { id: "data" }, "Data & Export");
      };
    }

    if (source.includes("danger-section")) {
      return function DangerSection() {
        return React.createElement("section", { id: "danger" }, "Danger Zone");
      };
    }

    return function UnknownDynamicSection() {
      return null;
    };
  },
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string) => key,
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
    error: vi.fn(),
  },
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

vi.mock("@/components/course-visibility/manager", () => ({
  default: (props: any) => {
    mocks.lastManagerProps = props;
    return React.createElement(
      "section",
      { id: "course-visibility" },
      "Course visibility controls",
    );
  },
  mergeCourseVisibilityItems: (sources: any[]) =>
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
                  courseId: 7,
                  courseName: "Algorithms",
                  dueCount: 2,
                  totalCards: 10,
                },
              ],
            }),
          );
        }

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
  });

  it("does not keep a duplicate settings route implementation beside the merged page", () => {
    expect(existsSync(join(process.cwd(), "src/app/settings/page.tsx"))).toBe(
      false,
    );
  });
});
