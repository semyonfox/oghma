import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  readDraft,
  writeDraft,
  type NoteDraft,
} from "@/lib/notes/draft-cache";

const cache = vi.hoisted(() => new Map<string, NoteDraft>());

vi.mock("@/lib/notes/cache", () => ({
  uiCache: {
    getItem: async (key: string) => {
      const draft = cache.get(key);
      return draft ? { ...draft } : undefined;
    },
    getOrMoveItem: async (
      preferredKey: string,
      otherKey: string,
      canMove: () => boolean,
    ) => {
      const preferred = cache.get(preferredKey);
      if (preferred) return { ...preferred };
      if (!canMove()) return undefined;
      const other = cache.get(otherKey);
      if (!other) return undefined;
      cache.set(preferredKey, { ...other });
      cache.delete(otherKey);
      return { ...other };
    },
    setItem: async (key: string, draft: NoteDraft) => {
      cache.set(key, { ...draft });
    },
    removeItemIf: async (
      key: string,
      matches: (current: NoteDraft | undefined) => boolean,
    ) => {
      if (matches(cache.get(key))) cache.delete(key);
    },
  },
}));

const noteId = "draft-test-note";

describe("pane draft recovery", () => {
  beforeEach(() => {
    cache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores independent drafts for both panes of the same note", async () => {
    const draftA = await writeDraft(noteId, "A", "pane A edits");
    const draftB = await writeDraft(noteId, "B", "pane B edits");

    expect(await readDraft(noteId, "A")).toEqual(draftA);
    expect(await readDraft(noteId, "B")).toEqual(draftB);
    expect(draftA.content).toBe("pane A edits");
    expect(draftB.content).toBe("pane B edits");
    expect(draftA.version).toEqual(expect.any(String));
    expect(draftB.version).toEqual(expect.any(String));
    expect(draftA.version).not.toBe(draftB.version);
  });

  it("clears a saved pane A draft while preserving pane B recovery", async () => {
    const draftA = await writeDraft(noteId, "A", "saved A");
    const draftB = await writeDraft(noteId, "B", "unsaved B");

    await clearDraft(noteId, "A", draftA);

    expect(await readDraft(noteId, "A")).toBeNull();
    expect(await readDraft(noteId, "B")).toEqual(draftB);
  });

  it("moves an orphaned B draft to A when recovery is allowed", async () => {
    const draftB = await writeDraft(noteId, "B", "closed pane B edits");

    expect(await readDraft(noteId, "A", () => true)).toEqual(draftB);
    expect(await readDraft(noteId, "A")).toEqual(draftB);
    expect(await readDraft(noteId, "B")).toBeNull();
    expect(cache.has(`draft:B:${noteId}`)).toBe(false);

    await clearDraft(noteId, "A", draftB);
    expect(await readDraft(noteId, "A")).toBeNull();
  });

  it.each([false, true])(
    "prefers the existing A draft and preserves B with legacy A=%s",
    async (legacy) => {
      vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      const draftA: NoteDraft = legacy
        ? { content: "existing A edits", draftAt: Date.now() }
        : await writeDraft(noteId, "A", "existing A edits");
      if (legacy) cache.set(`draft:${noteId}`, draftA);
      vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
      const draftB = await writeDraft(noteId, "B", "newer B edits");

      expect(await readDraft(noteId, "A", () => true)).toEqual(draftA);
      expect(await readDraft(noteId, "B")).toEqual(draftB);
      expect(cache.get(`draft:${noteId}`)).toEqual(draftA);
      expect(cache.get(`draft:B:${noteId}`)).toEqual(draftB);
    },
  );

  it("keeps a live B draft in place when recovery is denied", async () => {
    const draftB = await writeDraft(noteId, "B", "live pane B edits");

    expect(await readDraft(noteId, "A", () => false)).toBeNull();
    expect(await readDraft(noteId, "B")).toEqual(draftB);
    expect(cache.has(`draft:${noteId}`)).toBe(false);
  });

  it("does not take a B draft during a default A read", async () => {
    const draftB = await writeDraft(noteId, "B", "pane B edits");

    expect(await readDraft(noteId, "A")).toBeNull();
    expect(await readDraft(noteId, "B")).toEqual(draftB);
    expect(cache.has(`draft:${noteId}`)).toBe(false);
  });

  it.each(["A", "B"] as const)(
    "keeps a newer pane %s edit when an older save finishes",
    async (pane) => {
      const savedDraft = await writeDraft(noteId, pane, "saved content");
      const newerDraft = await writeDraft(noteId, pane, "new unsaved edit");

      await clearDraft(noteId, pane, savedDraft);

      expect(await readDraft(noteId, pane)).toEqual(newerDraft);
    },
  );

  it.each(["A", "B"] as const)(
    "keeps a newer pane %s draft with the same timestamp and content",
    async (pane) => {
      vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
      const savedDraft = await writeDraft(noteId, pane, "unchanged content");
      const newerDraft = await writeDraft(noteId, pane, "unchanged content");

      expect(newerDraft.draftAt).toBe(savedDraft.draftAt);
      expect(newerDraft.content).toBe(savedDraft.content);
      expect(newerDraft.version).not.toBe(savedDraft.version);

      await clearDraft(noteId, pane, savedDraft);

      expect(await readDraft(noteId, pane)).toEqual(newerDraft);
      await clearDraft(noteId, pane, newerDraft);
      expect(await readDraft(noteId, pane)).toBeNull();
    },
  );

  it("recovers a legacy pane A draft without exposing it to pane B", async () => {
    const legacyDraft: NoteDraft = {
      content: "unsaved legacy content",
      draftAt: 1_700_000_000_000,
    };
    cache.set(`draft:${noteId}`, legacyDraft);

    expect(await readDraft(noteId, "A")).toEqual(legacyDraft);
    expect(await readDraft(noteId, "B")).toBeNull();

    const draftB = await writeDraft(noteId, "B", "new pane B content");
    expect(cache.get(`draft:B:${noteId}`)).toEqual(draftB);
    expect(await readDraft(noteId, "A")).toEqual(legacyDraft);

    await clearDraft(noteId, "B", draftB);
    expect(await readDraft(noteId, "A")).toEqual(legacyDraft);
    expect(await readDraft(noteId, "B")).toBeNull();
  });

  it("does not erase a versionless legacy draft directly", async () => {
    const legacyDraft: NoteDraft = {
      content: "legacy recovery content",
      draftAt: 1_700_000_000_000,
    };
    cache.set(`draft:${noteId}`, legacyDraft);

    await clearDraft(noteId, "A", legacyDraft);

    expect(await readDraft(noteId, "A")).toEqual(legacyDraft);

    const rewrittenDraft = await writeDraft(noteId, "A", legacyDraft.content);
    await clearDraft(noteId, "A", legacyDraft);
    expect(await readDraft(noteId, "A")).toEqual(rewrittenDraft);

    await clearDraft(noteId, "A", rewrittenDraft);
    expect(await readDraft(noteId, "A")).toBeNull();
  });
});
