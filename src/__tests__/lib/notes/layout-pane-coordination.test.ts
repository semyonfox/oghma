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
});
