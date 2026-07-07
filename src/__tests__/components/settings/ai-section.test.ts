// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    ai_canvas_access: false,
    ai_model: "deepseek/deepseek-v3.2",
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

describe("AISection model selector", () => {
  beforeEach(() => {
    mocks.settings = {
      ai_canvas_access: false,
      ai_model: "deepseek/deepseek-v3.2",
    };
    vi.clearAllMocks();
  });

  it("selects the server-managed DeepSeek model and disables future options", () => {
    render(React.createElement(AISection));

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    const options = Array.from(select.options);

    expect(select.disabled).toBe(false);
    expect(select.value).toBe("deepseek/deepseek-v3.2");
    expect(
      options.find((option) => option.value === "deepseek/deepseek-v3.2")
        ?.disabled,
    ).toBe(false);
    expect(options.find((option) => option.value === "kimi-k2.5")?.disabled).toBe(
      true,
    );
    expect(
      options.find((option) => option.value === "custom-openrouter")?.disabled,
    ).toBe(true);
    expect(select.textContent).toContain("DeepSeek V3.2");
    expect(select.textContent).toContain("Custom OpenRouter model");
  });

  it("shows an unknown configured model as the active option", () => {
    mocks.settings = {
      ai_canvas_access: false,
      ai_model: "provider/current-model",
    };

    render(React.createElement(AISection));

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    const activeOption = Array.from(select.options).find(
      (option) => option.value === "provider/current-model",
    );

    expect(select.value).toBe("provider/current-model");
    expect(activeOption?.disabled).toBe(false);
    expect(activeOption?.textContent).toContain("server configured");
  });
});
