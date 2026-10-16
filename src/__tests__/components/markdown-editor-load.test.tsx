// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drafts: new Map<string, unknown>(),
  notes: new Map<string, unknown>(),
  fetchNote: vi.fn(),
  mutateNote: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  t: (text: string) => text,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: mocks.t }) }));
vi.mock("@/lib/notes/state/note", () => ({
  default: (select: (state: typeof mocks) => unknown) => select(mocks),
}));
vi.mock("@/lib/notes/cache", () => ({
  uiCache: {
    getItem: async (key: string) => mocks.drafts.get(key),
    setItem: async (key: string, value: unknown) => { mocks.drafts.set(key, value); },
    removeItemIf: async (key: string, matches: (value: unknown) => boolean) => {
      if (matches(mocks.drafts.get(key))) mocks.drafts.delete(key);
    },
    removeItem: async (key: string) => { mocks.drafts.delete(key); },
  },
  noteCacheInstance: { getItem: async (id: string) => mocks.notes.get(id) },
}));
vi.mock("next/dynamic", () => ({
  default: () => function WritingSurface({ value, onChange }: {
    value: string;
    onChange: (value: string, programmatic?: boolean) => void;
  }) {
    return <textarea aria-label="Note" value={value} onChange={(event) => onChange(event.target.value)} />;
  },
}));

import MarkdownEditor from "@/components/editor/markdown-editor";
import useLayoutStore from "@/lib/notes/state/layout";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import { beginDraftCacheReset, finishDraftCacheReset, waitForDraftWrites } from "@/lib/notes/draft-cache";

const NOTE_ID = "0197a6b2-0000-7000-8000-000000000001";
const file = { fileId: NOTE_ID, fileType: "note" as const };

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drafts.clear();
  mocks.notes.clear();
  finishDraftCacheReset(beginDraftCacheReset());
  useSettingsStore.getState().setSettings({ editorsize: "large" });
  useLayoutStore.setState({ activePane: "A", paneA: file, paneB: null });
  mocks.fetchNote.mockResolvedValue({ content: "Saved", updatedAt: "2026-10-01T00:00:00Z" });
  mocks.mutateNote.mockResolvedValue(undefined);
  setVisibility("visible");
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await waitForDraftWrites();
});

async function open() {
  await act(async () => {
    render(<MarkdownEditor pane="A" file={file} />);
  });
}

it("keeps a cached note open when the server cannot be reached", async () => {
  mocks.notes.set(NOTE_ID, { content: "Cached copy" });
  mocks.fetchNote.mockResolvedValue(undefined);
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetchMock);

  await open();

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    `/api/notes/${NOTE_ID}?fields=id`,
    expect.anything(),
  ));
  expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe("Cached copy");
  expect(useLayoutStore.getState().paneA.fileId).toBe(NOTE_ID);
  expect(mocks.router.replace).not.toHaveBeenCalled();
});

it("offers a retry when nothing local can be shown and the server errors", async () => {
  mocks.fetchNote.mockResolvedValueOnce(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 503 }));

  await open();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("could not be loaded");
  expect(useLayoutStore.getState().paneA.fileId).toBe(NOTE_ID);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });

  await waitFor(() => expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe("Saved"));
  expect(mocks.fetchNote).toHaveBeenCalledTimes(2);
});

it("closes the pane only when the server says the note is gone", async () => {
  mocks.fetchNote.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404 }));

  await open();

  await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/notes"));
  expect(useLayoutStore.getState().paneA.fileId).toBe("");
});

it("writes the pending draft as soon as the page is hidden", async () => {
  await open();
  await waitFor(() => expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe("Saved"));

  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Typed before switching apps" } });
  setVisibility("hidden");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await waitForDraftWrites();
  });

  // well inside the 1s debounce, so only the visibility flush can have written it
  expect(mocks.drafts.get(`draft:${NOTE_ID}`)).toMatchObject({
    content: "Typed before switching apps",
  });
});
