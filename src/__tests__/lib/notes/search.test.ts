import { describe, expect, it, vi } from "vitest";
import {
  NOTE_DELETED,
  NOTE_PINNED,
  NOTE_SHARED,
} from "@/lib/notes/types/meta";

const cachedValues = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/notes/cache/note", () => ({
  default: {
    iterate: vi.fn(async (callback: (value: unknown) => Promise<void>) => {
      for (const value of cachedValues) await callback(value);
    }),
  },
}));

import { searchNote } from "@/lib/notes/utils/search";

describe("searchNote", () => {
  it("finds every matching cached note without reusing RegExp state", async () => {
    cachedValues.length = 0;
    cachedValues.push(
      cachedNote("first", { rawContent: "Lecture notes" }),
      cachedNote("second", { rawContent: "Lecture exercises" }),
      cachedNote("deleted", { deleted: NOTE_DELETED.DELETED }),
      { title: 42 },
    );

    await expect(searchNote("lecture", NOTE_DELETED.NORMAL)).resolves.toEqual([
      expect.objectContaining({ id: "first" }),
      expect.objectContaining({ id: "second" }),
    ]);
  });
});

function cachedNote(
  id: string,
  overrides: Partial<{
    title: string;
    rawContent: string;
    deleted: NOTE_DELETED;
  }> = {},
) {
  return {
    id,
    title: id,
    rawContent: "",
    deleted: NOTE_DELETED.NORMAL,
    shared: NOTE_SHARED.PRIVATE,
    pinned: NOTE_PINNED.UNPINNED,
    ...overrides,
  };
}
