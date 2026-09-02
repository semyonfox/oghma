import { beforeEach, describe, expect, it } from "vitest";
import useLayoutStore from "@/lib/notes/state/layout.zustand";

const paneA = {
  fileId: "11111111-1111-4111-8111-111111111111",
  fileType: "note" as const,
  title: "Pane A",
};
const paneB = {
  fileId: "22222222-2222-4222-8222-222222222222",
  fileType: "note" as const,
  title: "Pane B",
};

describe("layout pane coordination", () => {
  beforeEach(() => {
    useLayoutStore.setState({
      paneA,
      paneB,
      activePane: "B",
      selectedNode: paneB.fileId,
    });
  });

  it("closes only pane B when its note is unavailable", () => {
    const surviving = useLayoutStore
      .getState()
      .dismissUnavailablePane("B", paneB.fileId);

    expect(surviving).toEqual(paneA);
    expect(useLayoutStore.getState()).toMatchObject({
      paneA,
      paneB: null,
      activePane: "A",
      selectedNode: paneA.fileId,
    });
  });

  it("promotes pane B when pane A's note is unavailable", () => {
    const surviving = useLayoutStore
      .getState()
      .dismissUnavailablePane("A", paneA.fileId);

    expect(surviving).toEqual(paneB);
    expect(useLayoutStore.getState()).toMatchObject({
      paneA: paneB,
      paneB: null,
      activePane: "A",
      selectedNode: paneB.fileId,
    });
  });

  it("does not close a pane after a stale request finishes", () => {
    const surviving = useLayoutStore
      .getState()
      .dismissUnavailablePane("B", paneA.fileId);

    expect(surviving).toBeUndefined();
    expect(useLayoutStore.getState()).toMatchObject({ paneA, paneB });
  });

  it("leaves an empty primary pane when its only note is unavailable", () => {
    useLayoutStore.setState({ paneB: null, selectedNode: paneA.fileId });

    const surviving = useLayoutStore
      .getState()
      .dismissUnavailablePane("A", paneA.fileId);

    expect(surviving).toBeNull();
    expect(useLayoutStore.getState()).toMatchObject({
      paneA: { fileId: "", fileType: "note" },
      paneB: null,
      activePane: "A",
      selectedNode: null,
    });
  });

  it("allows both side panels to grow to 600 pixels", () => {
    useLayoutStore.getState().setSizes(700, 700, 50);

    expect(useLayoutStore.getState()).toMatchObject({
      treeWidth: 600,
      rightPanelWidth: 600,
    });
  });

  it("swaps open panes atomically when a pane is dropped on the other", () => {
    let updates = 0;
    const unsubscribe = useLayoutStore.subscribe(() => updates++);

    useLayoutStore.getState().placeFileInPane(paneA, "B", "A");
    unsubscribe();

    expect(updates).toBe(1);
    expect(useLayoutStore.getState()).toMatchObject({
      paneA: paneB,
      paneB: paneA,
      activePane: "B",
      selectedNode: paneA.fileId,
    });
  });

  it("replaces only the targeted pane for a file dragged from the tree", () => {
    const treeFile = {
      fileId: "33333333-3333-4333-8333-333333333333",
      fileType: "pdf" as const,
      title: "Tree file",
    };

    useLayoutStore.getState().placeFileInPane(treeFile, "B");

    expect(useLayoutStore.getState()).toMatchObject({
      paneA,
      paneB: treeFile,
      activePane: "B",
      selectedNode: treeFile.fileId,
    });
  });

  it("does not duplicate a lone pane when it is dragged to the empty side", () => {
    useLayoutStore.setState({ paneB: null });

    useLayoutStore.getState().placeFileInPane(paneA, "B", "A");

    expect(useLayoutStore.getState()).toMatchObject({ paneA, paneB: null });
  });
});
