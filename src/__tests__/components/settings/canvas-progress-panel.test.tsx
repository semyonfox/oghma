// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (message: string, values?: Record<string, string | number>) =>
      message.replace(/\{(\w+)\}/g, (_, key: string) =>
        String(values?.[key] ?? `{${key}}`),
      ),
  }),
}));

import CanvasProgressPanel from "@/components/settings/canvas/canvas-progress-panel";

describe("CanvasProgressPanel", () => {
  it("reports a terminal run with failures as failed", () => {
    const { container } = render(
      <CanvasProgressPanel
        isImporting={false}
        isDiscovering={false}
        isSyncing={false}
        progress={{ percent: 100, completed: 0, total: 39 }}
        importSummary={{ imported: 0, forbidden: 17, failed: 22, skipped: 0 }}
        recentLogs={[
          {
            status: "error",
            filename: "lecture.pdf",
            errorMessage: "Storage upload failed for lecture.pdf",
            updatedAt: new Date().toISOString(),
          },
        ]}
        markerColdStarting={false}
        estimatedSecsRemaining={null}
      />,
    );

    expect(screen.getByText("Import failed")).toBeTruthy();
    expect(container.querySelector(".bg-red-500")).toBeTruthy();
    expect(
      screen
        .getByText("This file could not be imported.")
        .getAttribute("title"),
    ).toBe("Storage upload failed for lecture.pdf");
  });

  it("does not label a partially successful run as failed", () => {
    render(
      <CanvasProgressPanel
        isImporting={false}
        isDiscovering={false}
        isSyncing={false}
        progress={{ percent: 100, completed: 4, total: 5 }}
        importSummary={{ imported: 4, forbidden: 0, failed: 1, skipped: 0 }}
        recentLogs={[]}
        markerColdStarting={false}
        estimatedSecsRemaining={null}
      />,
    );

    expect(screen.getByText("Import complete")).toBeTruthy();
  });
});
