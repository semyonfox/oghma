// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? key.replace("{count}", String(values.count)) : key,
  }),
}));
import ProcessingFilesCard from "@/components/canvas/processing-files-card";

const status = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("processing files card", () => {
  it("shows each file at its import stage while a job runs", async () => {
    vi.stubGlobal(
      "fetch",
      status({
        pollIntervalMs: 60_000,
        activeJob: { jobId: "job-1" },
        recentLogs: [
          { filename: "Lecture 9.pdf", status: "indexing", noteId: "n1" },
          { filename: "Tutorial 4 scan.pdf", status: "pending_extract", noteId: "n2" },
          { filename: "Lecture 10.pdf", status: "pending", noteId: null },
          { filename: "Lecture 8.pdf", status: "done", noteId: "n3" },
        ],
      }),
    );
    render(<ProcessingFilesCard />);
    expect(await screen.findByRole("heading", { name: "Processing 3 files" })).toBeTruthy();
    const statusOf = (file: string) =>
      screen.getByText(file).closest("tr")?.querySelector("td:last-child")?.textContent;
    expect(statusOf("Lecture 9.pdf")).toBe("Embedding");
    expect(statusOf("Tutorial 4 scan.pdf")).toBe("OCR");
    expect(statusOf("Lecture 10.pdf")).toBe("Queued");
    expect(statusOf("Lecture 8.pdf")).toBe("Ready");
  });

  it("stays out of the way when nothing is importing", async () => {
    const idle = status({ activeJob: null, recentLogs: [{ filename: "Old.pdf", status: "processing" }] });
    vi.stubGlobal("fetch", idle);
    render(<ProcessingFilesCard />);
    await vi.waitFor(() => expect(idle).toHaveBeenCalled());
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
