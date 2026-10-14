// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ExamPaperImportControl from "@/components/study-map/exam-paper-import";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/components/study-map/study-client", () => ({
  requestJson: mocks.request,
  messageFor: (error: Error) => error.message,
}));
const mapId = "11111111-1111-4111-8111-111111111111";
const result = {
  noteId: mapId,
  textNoteId: "22222222-2222-4222-8222-222222222222",
  duplicate: false,
  indexing: "queued",
};
function file(name = "ct318.oghma-exam.json") {
  const text = JSON.stringify({
    format: "oghma-exam-paper",
    version: 1,
    filename: "2025_2026_CT318_1_1_5.pdf",
    title: "HCI",
    moduleCode: "CT318",
    academicYear: "2025/2026",
    sitting: 1,
    period: 5,
    sha256: "a".repeat(64),
    pdfBase64: btoa("%PDF-fixture"),
    text: "[Page 1]\nQuestion 1",
    warnings: [],
  });
  const value = new File([text], name, { type: "application/json" });
  Object.defineProperty(value, "text", { value: async () => text });
  return value;
}
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.request.mockResolvedValue(result);
});
describe("module exam import control", () => {
  it("previews the paper and target module before sending anything", async () => {
    const refresh = vi.fn(async () => undefined);
    render(
      <ExamPaperImportControl
        mapId={mapId}
        moduleName="CT318 Human Computer Interaction"
        onImported={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose exam files"), {
      target: { files: [file()] },
    });
    await screen.findByText("Ready to import");
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 paper" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mocks.request.mock.calls[0]?.[0]).toBe(
      `/api/study-maps/${mapId}/papers/import`,
    );
  });
  it("preserves successful imports while retrying indexing failures, including duplicate responses", async () => {
    mocks.request
      .mockResolvedValueOnce({
        ...result,
        duplicate: true,
        indexing: "retry-needed",
      })
      .mockResolvedValue(result);
    render(
      <ExamPaperImportControl
        mapId={mapId}
        moduleName="CT318"
        onImported={async () => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Choose exam files"), {
      target: { files: [file()] },
    });
    await screen.findByText("Ready to import");
    fireEvent.click(screen.getByRole("button", { name: "Import 1 paper" }));
    const retry = await screen.findByRole("button", { name: "Retry 1 paper" });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    await screen.findByText("Imported");
  });
});
