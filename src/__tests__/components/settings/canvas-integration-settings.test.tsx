// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import CanvasIntegrationSettings from "@/components/settings/canvas-integration-settings";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params?.[name] ?? ""),
      ),
  }),
}));
vi.mock("@/components/settings/canvas/use-canvas-import", () => ({
  default: () => ({
    pendingReplacement: null,
    setPendingReplacement: vi.fn(),
    confirmReplacement: vi.fn(),
    isReplacing: false,
    pendingTrash: null,
    setPendingTrash: vi.fn(),
    handleTrashChoice: vi.fn(),
    isRestoring: false,
    discovery: null,
    terminalStatus: null,
    retrySourceJobId: null,
    handleRetry: vi.fn(),
    isImporting: false,
    isDiscovering: false,
    importSummary: null,
    progress: null,
    recentLogs: [],
    isSyncing: false,
    markerColdStarting: false,
    estimatedSecsRemaining: null,
    handleImport: vi.fn(),
    handleSync: vi.fn(),
    handleCancel: vi.fn(),
    resetStatus: vi.fn(),
  }),
}));

function mockConnectionResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

describe("CanvasIntegrationSettings connection check", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("waits for the saved connection check before showing the school picker", async () => {
    let finishCheck: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () => new Promise((resolve) => { finishCheck = resolve; }),
      ),
    );

    render(<CanvasIntegrationSettings />);

    expect(screen.getByRole("status").textContent).toContain(
      "Checking Canvas connection...",
    );
    expect(screen.queryByLabelText("Find your school on Canvas")).toBeNull();

    await act(async () => {
      finishCheck?.({
        ok: true,
        status: 200,
        json: async () => ({ connected: false, connectionState: "not-configured" }),
      });
    });
    expect(screen.getByLabelText("Find your school on Canvas")).toBeTruthy();
  });

  it("opens setup without an expired-token warning for a first connection", async () => {
    mockConnectionResponse({
      connected: false,
      connectionState: "not-configured",
    });

    render(<CanvasIntegrationSettings />);

    expect(
      await screen.findByText("How to generate your Canvas API token"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Your Canvas token is invalid or expired. Please reconnect.",
      ),
    ).toBeNull();
  });

  it("shows reconnection guidance and restores the known Canvas host", async () => {
    mockConnectionResponse({
      connected: false,
      connectionState: "needs-reconnection",
      domain: "example.instructure.com",
    });

    render(<CanvasIntegrationSettings />);

    expect(
      await screen.findByText(
        "Your Canvas token is invalid or expired. Please reconnect.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Canvas URL") as HTMLInputElement).value,
    ).toBe("example.instructure.com");
    expect(
      screen.getByRole("link", { name: "Log into your Canvas account" })
        .getAttribute("href"),
    ).toBe("https://example.instructure.com");
  });

  it.each(["needs-reconnection", "temporarily-unavailable"] as const)(
    "preserves saved course selection when connection is %s",
    async (connectionState) => {
      localStorage.setItem("canvas_selected_courses", '["42"]');
      mockConnectionResponse({
        connected: false,
        connectionState,
        domain: "example.instructure.com",
      });

      render(<CanvasIntegrationSettings />);

      await screen.findByLabelText("Canvas URL");
      expect(localStorage.getItem("canvas_selected_courses")).toBe('["42"]');
    },
  );

  it("preserves saved course selection when the connection check fails", async () => {
    localStorage.setItem("canvas_selected_courses", '["42"]');
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    render(<CanvasIntegrationSettings />);

    await screen.findByText(
      "Could not check Canvas right now. Reload this page to try again.",
    );
    expect(localStorage.getItem("canvas_selected_courses")).toBe('["42"]');
  });

  it("keeps a temporary Canvas failure separate from invalid credentials", async () => {
    mockConnectionResponse({
      connected: false,
      connectionState: "temporarily-unavailable",
      domain: "example.instructure.com",
    });

    render(<CanvasIntegrationSettings />);

    expect(
      await screen.findByText(
        "Could not check Canvas right now. Reload this page to try again.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Your Canvas token is invalid or expired. Please reconnect.",
      ),
    ).toBeNull();
  });

  it("keeps OghmaNotes session expiry distinct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => {
          throw new Error("not JSON");
        },
      }),
    );

    render(<CanvasIntegrationSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("Your session has expired. Please log in again."),
      ).toBeTruthy();
    });
    expect(
      screen.queryByText(
        "Your Canvas token is invalid or expired. Please reconnect.",
      ),
    ).toBeNull();
  });

  it("selects and deselects only available courses from a long list", async () => {
    localStorage.setItem("canvas_selected_courses", "[]");
    mockConnectionResponse({
      connected: true,
      connectionState: "connected",
      domain: "example.instructure.com",
      courses: Array.from({ length: 12 }, (_, index) => ({
        id: String(index + 1),
        name: `Course ${index + 1}`,
        course_code: `CT${index + 1}`,
        canvasStatus: index === 11 ? "unavailable" : "current",
      })),
    });

    render(<CanvasIntegrationSettings />);

    const selectAll = await screen.findByRole("button", { name: "Select all" });
    expect(screen.getByText("0 of 11 available courses selected")).toBeTruthy();
    selectAll.focus();
    expect(document.activeElement).toBe(selectAll);
    fireEvent.click(selectAll);

    expect(
      screen.getByRole("button", { name: "Import selected courses (11)" }),
    ).toBeTruthy();
    expect(
      screen.getByText("11 of 11 available courses selected"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: /Course 12/i }) as HTMLInputElement)
        .checked,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByRole("button", { name: "Select all" })).toBeTruthy();
    expect(screen.getByText("0 of 11 available courses selected")).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Course 1(?!\d)/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("selects available courses on first connection before saving the selection", async () => {
    mockConnectionResponse({
      connected: true,
      connectionState: "connected",
      domain: "example.instructure.com",
      courses: [
        { id: 1, name: "Available course", canvasStatus: "current" },
        { id: 2, name: "Unavailable course", canvasStatus: "unavailable" },
      ],
    });

    render(<CanvasIntegrationSettings />);

    expect(
      await screen.findByText("1 of 1 available courses selected"),
    ).toBeTruthy();
    await waitFor(() => {
      expect(localStorage.getItem("canvas_selected_courses")).toBe('["1"]');
    });
  });
});
