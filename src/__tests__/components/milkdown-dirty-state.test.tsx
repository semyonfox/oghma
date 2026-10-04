// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";

const editor = vi.hoisted(() => ({
  markdown: "# Saved note\n",
  updated: (_ctx: unknown, _markdown: string) => {},
}));

vi.mock("@milkdown/crepe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@milkdown/crepe")>();
  return {
    ...original,
    Crepe: class {
      editor = { use: vi.fn() };
      on(register: (listener: { markdownUpdated: (callback: typeof editor.updated) => void }) => void) {
        register({ markdownUpdated: (callback) => { editor.updated = callback; } });
      }
      async create() {}
      async destroy() {}
      getMarkdown() { return editor.markdown; }
    },
  };
});
vi.mock("@/lib/markdown/components/mermaid-viewer-dialog", () => ({ default: () => null }));
vi.mock("@/lib/markdown/components/mermaid-inline-viewer", () => ({ default: () => null }));

import MilkdownWriteEditor from "@/components/editor/milkdown-write-editor";

const host = document.createElement("div");
document.body.append(host);
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root.unmount());
  editor.markdown = "# Saved note\n";
});

it("ignores the delayed normalized document event after opening a saved note", async () => {
  const onChange = vi.fn();
  root = createRoot(host);
  await act(async () => {
    root.render(<MilkdownWriteEditor value={editor.markdown} onChange={onChange} />);
  });
  await act(async () => editor.updated(null, editor.markdown));
  expect(onChange).not.toHaveBeenCalled();
});

it("reports real edits and undo back to the original document", async () => {
  const onChange = vi.fn();
  root = createRoot(host);
  await act(async () => {
    root.render(<MilkdownWriteEditor value={editor.markdown} onChange={onChange} />);
  });
  await act(async () => editor.updated(null, "# Edited note\n"));
  await act(async () => editor.updated(null, editor.markdown));
  expect(onChange.mock.calls).toEqual([
    ["# Edited note\n", false],
    [editor.markdown, false],
  ]);
});

it("publishes the latest document before an immediate keyboard save and ignores its delayed echo", async () => {
  let published = editor.markdown;
  const onChange = vi.fn((markdown: string) => { published = markdown; });
  const saved: string[] = [];
  root = createRoot(host);
  await act(async () => {
    root.render(<MilkdownWriteEditor value={editor.markdown} onChange={onChange}
      onSave={() => saved.push(published)} />);
  });
  editor.markdown = "# Saved note\n\nLast typed words\n";
  const surface = host.querySelector(".oghma-milkdown-editor");
  if (!surface) throw new Error("Missing editor surface");
  await act(async () => fireEvent.keyDown(surface, { key: "s", ctrlKey: true }));
  expect(saved).toEqual([editor.markdown]);
  await act(async () => editor.updated(null, editor.markdown));
  expect(onChange).toHaveBeenCalledOnce();
});

it("publishes pending edits during blur before the parent can autosave", async () => {
  const onChange = vi.fn();
  const observedOnBlur: string[] = [];
  root = createRoot(host);
  await act(async () => {
    root.render(<div onBlur={() => observedOnBlur.push(onChange.mock.calls.at(-1)?.[0] ?? "stale")}>
      <MilkdownWriteEditor value={editor.markdown} onChange={onChange} />
    </div>);
  });
  editor.markdown = "# Saved note\n\nPending blur edit\n";
  const surface = host.querySelector(".oghma-milkdown-editor");
  if (!surface) throw new Error("Missing editor surface");
  await act(async () => fireEvent.focusOut(surface));
  expect(observedOnBlur).toEqual([editor.markdown]);
  expect(onChange).toHaveBeenCalledOnce();
});
