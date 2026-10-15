// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutateNote: vi.fn() }));

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/study-map/note-study-labels", () => ({ default: () => null }));
vi.mock("@/lib/notes/state/note", () => ({
  default: { getState: () => ({ mutateNote: mocks.mutateNote }) },
}));

import NoteInspectorPanel from "@/components/notes/note-inspector-panel";
import useLayoutStore from "@/lib/notes/state/layout";
import useSaveIndicatorStore from "@/lib/notes/state/save-indicator";

const NOTE_ID = "0198f4ec-4f16-7000-8000-000000000001";

function openInspector() {
  useLayoutStore.setState({
    paneA: { fileId: NOTE_ID, fileType: "note", title: "Lecture" },
    paneB: null,
    activePane: "A",
    rightPanelOpen: true,
    rightPanelTab: "meta",
  });
  render(<NoteInspectorPanel />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutateNote.mockResolvedValue(undefined);
  useSaveIndicatorStore.setState({ files: {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    Response.json(url.endsWith("/backlinks")
      ? { incoming: [], outgoing: [] }
      : { id: NOTE_ID, title: "Lecture", content: "# Body" }),
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("inspector tags", () => {
  it("saves through the note store and hands the tagged content to open editors", async () => {
    const synced = vi.fn();
    window.addEventListener("note-content-sync", synced);
    openInspector();

    const input = await screen.findByRole("textbox", { name: "add tag" });
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(input, { target: { value: "exam" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.mutateNote).toHaveBeenCalledWith(NOTE_ID, { content: "# Body\n#exam\n" }),
    );
    // a clean editor adopts this content, so its next save keeps the tag
    await waitFor(() => expect(synced).toHaveBeenCalled());
    expect((synced.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      fileId: NOTE_ID,
      content: "# Body\n#exam\n",
    });
    window.removeEventListener("note-content-sync", synced);
  });

  it("holds tag edits while an editor has unsaved text for the note", async () => {
    useSaveIndicatorStore.setState({
      files: { [NOTE_ID]: { state: "dirty", ready: true, save: vi.fn() } },
    });
    openInspector();

    // the note itself has loaded; only the unsaved editor blocks the edit
    await screen.findByText(NOTE_ID);
    const input = screen.getByRole("textbox", { name: "add tag" });
    fireEvent.change(input, { target: { value: "exam" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(mocks.mutateNote).not.toHaveBeenCalled();
  });
});
