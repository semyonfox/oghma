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
  it("shows course discovery without an ETA", () => {
    render(
      <CanvasProgressPanel
        isImporting
        isDiscovering
        isSyncing={false}
        progress={{ percent: 0, completed: 0, total: 0 }}
        importSummary={null}
        recentLogs={[]}
        markerColdStarting={false}
        estimatedSecsRemaining={120}
        discovery={{ completedCourses: 2, totalCourses: 5, stage: "files", filesFound: 8 }}
      />,
    );

    expect(screen.getByText("Finding files...")).toBeTruthy();
    expect(screen.getByText("2 of 5 courses checked")).toBeTruthy();
    expect(screen.queryByText("2m left")).toBeNull();
    expect(screen.getByText(/continues in the background/)).toBeTruthy();
  });

  it("keeps one failed file separate from an active import", () => {
    render(
      <CanvasProgressPanel
        isImporting
        isDiscovering={false}
        isSyncing={false}
        progress={{ percent: 33, completed: 1, total: 3 }}
        importSummary={null}
        recentLogs={[{ status: "error", filename: "restricted.pdf", errorMessage: "File unavailable" }]}
        markerColdStarting={false}
        estimatedSecsRemaining={null}
      />,
    );

    expect(screen.getByText("Importing... (1/3)")).toBeTruthy();
    expect(screen.getByText("One failed or restricted file does not stop the other files.")).toBeTruthy();
    expect(screen.queryByText("Import stopped")).toBeNull();
  });

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

    expect(screen.getByText("Completed with issues")).toBeTruthy();
  });
});


it("explains skipped Trash courses after the run completes", () => {
  render(<CanvasProgressPanel isImporting={false} isDiscovering={false} isSyncing={false}
    progress={{ percent: 100, completed: 0, total: 0 }} importSummary={{ imported: 0, forbidden: 0, failed: 0, skipped: 0 }}
    recentLogs={[]} markerColdStarting={false} estimatedSecsRemaining={null}
    discovery={{ completedCourses: 2, totalCourses: 2, stage: "files", filesFound: 0, skippedCourses: ["CS101"] }} />);
  expect(screen.getByText(/Restore them to include/).textContent).toContain("CS101");
  expect(screen.getByText("Completed with issues")).toBeTruthy();
});
