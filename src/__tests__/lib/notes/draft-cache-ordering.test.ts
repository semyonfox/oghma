import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  setItem: vi.fn(),
}));
vi.mock("@/lib/notes/cache", () => ({ uiCache: {
  setItem: mocks.setItem,
  getItem: async (key: string) => mocks.values.get(key),
  removeItem: async (key: string) => { mocks.values.delete(key); },
} }));
import { clearDraft, readDraft, waitForDraftWrites, writeDraft } from "@/lib/notes/draft-cache";

beforeEach(() => { mocks.values.clear(); mocks.setItem.mockReset(); });

it("a delayed draft write cannot recreate a draft after a successful save clears it", async () => {
  let release: () => void = () => {};
  mocks.setItem.mockImplementation(async (key: string, value: unknown) => {
    await new Promise<void>((resolve) => { release = resolve; });
    mocks.values.set(key, value);
  });
  const writing = writeDraft("note", "Saved text");
  await vi.waitFor(() => expect(mocks.setItem).toHaveBeenCalledOnce());
  const clearing = clearDraft("note");
  release();
  await Promise.all([writing, clearing]);
  expect(await readDraft("note")).toBeNull();
});

it("preserves a new edit queued after the saved draft is cleared", async () => {
  mocks.setItem.mockImplementation(async (key: string, value: unknown) => { mocks.values.set(key, value); });
  await Promise.all([
    writeDraft("note", "First"),
    clearDraft("note"),
    writeDraft("note", "New edit"),
  ]);
  await waitForDraftWrites();
  expect(await readDraft("note")).toMatchObject({ content: "New edit" });
});
