// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    ai_canvas_access: false,
    ai_model: "deepseek/deepseek-v4-flash",
  },
  updateSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/notes/state/ui/settings", () => ({
  useSettingsStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      settings: mocks.settings,
      updateSettings: mocks.updateSettings,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import AISection from "@/components/settings/ai-section";

describe("AISection server-managed model", () => {
  beforeEach(() => {
    mocks.settings = {
      ai_canvas_access: false,
      ai_model: "deepseek/deepseek-v4-flash",
    };
    vi.clearAllMocks();
  });

  it("shows the configured model as read-only", () => {
    render(React.createElement(AISection));

    const input = screen.getByLabelText("Model") as HTMLInputElement;

    expect(input.value).toBe("deepseek/deepseek-v4-flash");
    expect(input.readOnly).toBe(true);
    expect(screen.getByText("Server-managed during beta.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("renders an unknown server-configured model without inventing choices", () => {
    mocks.settings = {
      ai_canvas_access: false,
      ai_model: "provider/current-model",
    };

    render(React.createElement(AISection));

    const input = screen.getByLabelText("Model") as HTMLInputElement;

    expect(input.value).toBe("provider/current-model");
    expect(input.readOnly).toBe(true);
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("enables saving only after the Canvas access preference changes", () => {
    render(React.createElement(AISection));

    const saveButton = screen.getByRole("button", {
      name: "Save changes",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(saveButton.disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Unsaved");
  });
});
