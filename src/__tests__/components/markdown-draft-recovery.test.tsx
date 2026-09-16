// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  fetchNote: vi.fn(), mutateNote: vi.fn(),
  info: vi.fn(), warning: vi.fn(), error: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  t: (text: string) => text,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("sonner", () => ({ toast: { info: mocks.info, warning: mocks.warning, error: mocks.error } }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: mocks.t }) }));
vi.mock("@/lib/notes/state/note", () => ({ default: (select: (state: typeof mocks) => unknown) => select(mocks) }));
vi.mock("@/lib/notes/cache", () => ({
  uiCache: {
    getItem: async (key: string) => mocks.cache.get(key),
    setItem: async (key: string, value: unknown) => { mocks.cache.set(key, value); },
    removeItem: async (key: string) => { mocks.cache.delete(key); },
  },
  noteCacheInstance: { getItem: async () => null },
}));
vi.mock("next/dynamic", () => ({ default: () => function WritingSurface({ value, onChange }: {
  value: string; onChange: (value: string, programmatic?: boolean) => void;
}) { return <textarea aria-label="Note" value={value} onChange={(event) => onChange(event.target.value)} />; } }));

import MarkdownEditor from "@/components/editor/markdown-editor";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import useSaveIndicatorStore from "@/lib/notes/state/save-indicator";
import { beginDraftCacheReset, finishDraftCacheReset, waitForDraftWrites, writeDraft } from "@/lib/notes/draft-cache";

beforeEach(() => {
  mocks.cache.clear();
  vi.clearAllMocks();
  finishDraftCacheReset(beginDraftCacheReset());
  useSettingsStore.getState().setSettings({ editorsize: "medium" });
  mocks.fetchNote.mockResolvedValue({ content: "Saved", updatedAt: "2026-09-15T12:00:00Z" });
  mocks.mutateNote.mockResolvedValue(undefined);
});
afterEach(async () => { cleanup(); await waitForDraftWrites(); });
async function open() {
  let view!: ReturnType<typeof render>;
  // Recovery toasts run inside the load promise; the save indicator is
  // published by a later React effect. Flush both before asserting either.
  await act(async () => {
    view = render(<MarkdownEditor pane="A" file={{ fileId: "note", fileType: "note" }} />);
  });
  return view;
}
const state = () => useSaveIndicatorStore.getState().files.note?.state;

it("clears a cached draft matching the saved document without a recovery or conflict popup", async () => {
  mocks.cache.set("draft:note", { content: "Saved", draftAt: 1 });
  await open();
  await waitFor(() => expect(mocks.cache.has("draft:note")).toBe(false));
  expect(state()).toBe("saved");
  expect(mocks.info).not.toHaveBeenCalled();
  expect(mocks.warning).not.toHaveBeenCalled();
});

it("announces a recovered draft once, retains it, and stays quiet when reopened", async () => {
  mocks.cache.set("draft:note", { content: "Recovered", draftAt: Date.parse("2026-09-15T13:00:00Z") });
  const first = await open();
  await waitFor(() => expect(mocks.info).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox")).toHaveProperty("value", "Recovered");
  expect(state()).toBe("dirty");
  act(() => first.unmount());
  await waitForDraftWrites();
  await open();
  await waitFor(() => expect(mocks.fetchNote).toHaveBeenCalledTimes(2));
  expect(mocks.info).toHaveBeenCalledTimes(1);
});

it("does not announce a draft created during ordinary navigation in this session", async () => {
  await writeDraft("note", "Work in progress");
  await open();
  await waitFor(() => expect(state()).toBe("dirty"));
  expect(mocks.info).not.toHaveBeenCalled();
});

it("retains real conflict warnings instead of showing the routine recovery popup", async () => {
  mocks.cache.set("draft:note", { content: "Older work", draftAt: 1 });
  await open();
  await waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(1));
  expect(mocks.info).not.toHaveBeenCalled();
  expect(state()).toBe("dirty");
});

it("saves genuine edits and keeps a newer edit dirty while an earlier save completes", async () => {
  let finishSave: () => void = () => {};
  mocks.mutateNote.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));
  await open();
  await screen.findByRole("textbox");
  expect(state()).toBe("saved");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "First edit" } });
  expect(state()).toBe("dirty");
  act(() => useSaveIndicatorStore.getState().files.note.save());
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second edit" } });
  await act(async () => finishSave());
  expect(mocks.mutateNote).toHaveBeenCalledWith("note", { content: "First edit" });
  expect(state()).toBe("dirty");
  expect(screen.getByRole("textbox")).toHaveProperty("value", "Second edit");
});

it("shows save errors while retaining the unsaved text", async () => {
  mocks.mutateNote.mockRejectedValue(new Error("offline"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await open();
  await screen.findByRole("textbox");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep me" } });
  await act(async () => useSaveIndicatorStore.getState().files.note.save());
  await waitFor(() => expect(state()).toBe("error"));
  expect(mocks.error).toHaveBeenCalledWith("Failed to save note");
  expect(screen.getByRole("textbox")).toHaveProperty("value", "Keep me");
  log.mockRestore();
});
