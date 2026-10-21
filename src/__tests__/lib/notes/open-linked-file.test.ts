import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useLayoutStore from "@/lib/notes/state/layout";
import useNoteTreeStore from "@/lib/notes/state/tree";
import { DEFAULT_TREE, ROOT_ID } from "@/lib/notes/types/tree";
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "@/lib/notes/types/meta";
import { openLinkedFileBeside } from "@/lib/notes/utils/open-linked-file";

const flags = {
  deleted: NOTE_DELETED.NORMAL,
  shared: NOTE_SHARED.PRIVATE,
  pinned: NOTE_PINNED.UNPINNED,
};

describe("openLinkedFileBeside", () => {
  beforeEach(() => {
    useLayoutStore.getState().resetWorkspace();
    useLayoutStore.getState().setPaneA({ fileId: "writing", fileType: "note", title: "Essay.md" });
    useNoteTreeStore.setState({
      tree: {
        rootId: ROOT_ID,
        items: {
          [ROOT_ID]: { id: ROOT_ID, children: ["slides", "other-note"] },
          slides: {
            id: "slides",
            children: [],
            data: { id: "slides", title: "Lecture 3.pdf", s3Key: "notes/slides/a/l3.pdf", mimeType: "application/pdf", ...flags },
          },
          "other-note": {
            id: "other-note",
            children: [],
            data: { id: "other-note", title: "Ideas.md", ...flags },
          },
        },
      },
      pinnedTree: structuredClone(DEFAULT_TREE),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("opens a linked PDF in the other pane and keeps the note being written", async () => {
    await expect(openLinkedFileBeside("slides", "A")).resolves.toBe(true);

    const { paneA, paneB, activePane } = useLayoutStore.getState();
    expect(paneA.fileId).toBe("writing");
    expect(paneB).toMatchObject({ fileId: "slides", fileType: "pdf" });
    expect(activePane).toBe("B");
  });

  it("leaves links to other notes to normal navigation", async () => {
    await expect(openLinkedFileBeside("other-note", "A")).resolves.toBe(false);
    expect(useLayoutStore.getState().paneB).toBeNull();
  });

  it("asks the server about a file the tree has not loaded", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "deep", title: "Exam.pdf", s3Key: "notes/deep/a/exam.pdf", mimeType: "application/pdf" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(openLinkedFileBeside("deep", "B")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notes/deep?fields=id,title,s3Key,mimeType",
      expect.anything(),
    );
    expect(useLayoutStore.getState().paneA).toMatchObject({ fileId: "deep", fileType: "pdf" });
  });
});
