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
  const { Ctx, Container, Clock } = await import("@milkdown/kit/ctx");
  const { editorViewCtx, parserCtx } = await import("@milkdown/kit/core");
  const { Schema } = await import("@milkdown/kit/prose/model");
  const { EditorState } = await import("@milkdown/kit/prose/state");
  const { EditorView } = await import("@milkdown/kit/prose/view");
  const schema = new Schema({ nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0] }, text: {},
  } });
  const parse = (markdown: string) => schema.node("doc", null, [
    schema.node("paragraph", null, markdown ? schema.text(markdown) : undefined),
  ]);
  return {
    ...original,
    Crepe: class {
      context = new Ctx(new Container(), new Clock());
      view: InstanceType<typeof EditorView> | null = null;
      editor = {
        use: vi.fn(),
        action: <T,>(callback: (ctx: InstanceType<typeof Ctx>) => T) => callback(this.context),
      };
      on(register: (listener: { markdownUpdated: (callback: typeof editor.updated) => void }) => void) {
        register({ markdownUpdated: (callback) => { editor.updated = callback; } });
      }
      async create() {
        this.view = new EditorView(document.createElement("div"), {
          state: EditorState.create({ schema, doc: parse(editor.markdown) }),
          dispatchTransaction: (transaction) => {
            editor.markdown = transaction.doc.textContent;
            if (this.view) this.view.updateState(this.view.state.apply(transaction));
          },
        });
        this.context.inject(editorViewCtx, this.view).inject(parserCtx, parse);
      }
      async destroy() { this.view?.destroy(); }
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
  const original = editor.markdown;
  editor.markdown = "# Edited note\n";
  await act(async () => editor.updated(null, editor.markdown));
  editor.markdown = original;
  await act(async () => editor.updated(null, editor.markdown));
  expect(onChange.mock.calls).toEqual([
    ["# Edited note\n", false],
    [editor.markdown, false],
  ]);
});

it("ignores an earlier local notification after an external document replacement", async () => {
  const onChange = vi.fn();
  root = createRoot(host);
  await act(async () => {
    root.render(<MilkdownWriteEditor value={editor.markdown} onChange={onChange} />);
  });
  const pending = "# Pending local edit\n";
  editor.markdown = pending;
  await act(async () => {
    root.render(<MilkdownWriteEditor value="# External replacement" onChange={onChange} />);
  });
  await act(async () => editor.updated(null, pending));
  expect(editor.markdown).toBe("# External replacement");
  expect(onChange).not.toHaveBeenCalled();
});

it("accepts an external value equal to a prior local emission after another replacement", async () => {
  const onChange = vi.fn();
  root = createRoot(host);
  await act(async () => {
    root.render(<MilkdownWriteEditor value={editor.markdown} onChange={onChange} />);
  });
  editor.markdown = "# Local A";
  await act(async () => editor.updated(null, editor.markdown));
  await act(async () => {
    root.render(<MilkdownWriteEditor value="# External B" onChange={onChange} />);
  });
  expect(editor.markdown).toBe("# External B");
  await act(async () => {
    root.render(<MilkdownWriteEditor value="# Local A" onChange={onChange} />);
  });
  expect(editor.markdown).toBe("# Local A");
  expect(onChange).toHaveBeenCalledOnce();
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
