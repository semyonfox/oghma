"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { Slice } from "@milkdown/kit/prose/model";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import DOMPurify from "dompurify";
import { renderMermaidElement } from "@/lib/markdown/mermaid";
import { markdownSanitizeSchema } from "@/lib/markdown/sanitize-schema";
import {
  buildInternalNoteHref,
  parseInternalNoteHref,
} from "@/lib/notes/internal-links";
import usePortalStore from "@/lib/notes/state/portal";

interface MilkdownWriteEditorProps {
  value: string;
  onChange: (value: string, programmaticUpdate?: boolean) => void;
  onSave?: () => void;
  placeholder?: string;
  currentNoteId?: string;
  onOpenNote?: (noteId: string) => void;
}

interface NoteOption {
  id: string;
  title?: string;
  isFolder?: boolean;
}

const NOTE_LINK_ICON = `<svg class="oghma-note-link-icon" viewBox="0 0 24 24" role="img"><title>Reference note</title><path d="M7 3.75h7l3 3v5.5M14 3.75v3h3M9.5 14.5l-1 1a2.12 2.12 0 0 0 3 3l1.25-1.25m1.75-2.75 1-1a2.12 2.12 0 0 0-3-3l-1.25 1.25m-.75 4.25 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function enhanceNoteReferenceButton(root: HTMLElement) {
  const button = root.querySelector(".oghma-note-link-icon")?.closest("button");
  button?.setAttribute("title", "Reference note");
  button?.setAttribute("aria-label", "Reference note");
}

function replaceExternalMarkdown(crepe: Crepe, markdown: string) {
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = ctx.get(parserCtx)(markdown);
    if (!doc) return;
    const transaction = view.state.tr
      .replace(0, view.state.doc.content.size, new Slice(doc.content, 0, 0))
      .setMeta("addToHistory", false);
    view.dispatch(transaction);
  });
}

export function shouldApplyExternalMarkdown(
  value: string,
  lastLocallyEmittedValue: string | null,
) {
  return value !== lastLocallyEmittedValue;
}

const COPY_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 13H3.5A1.5 1.5 0 0 1 2 11.5v-8A1.5 1.5 0 0 1 3.5 2h8A1.5 1.5 0 0 1 13 3.5V4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const WRAP_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h11a3 3 0 0 1 0 6H7m0 0 3-3m-3 3 3 3M3 15h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const LANGUAGE_NAMES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  md: "Markdown",
  markdown: "Markdown",
  py: "Python",
  python: "Python",
  diff: "Diff",
  mermaid: "Mermaid",
  sh: "Shell",
  bash: "Shell",
};

const INLINE_HTML_TAGS = new Set(["mark", "kbd", "sup", "sub"]);

function sanitizeRawHtml(value: string): string {
  const allowedAttributes = new Set<string>();
  Object.values(markdownSanitizeSchema.attributes ?? {}).forEach((attributes) => {
    attributes?.forEach((attribute) => {
      if (typeof attribute === "string") allowedAttributes.add(attribute);
      else if (Array.isArray(attribute) && typeof attribute[0] === "string") {
        allowedAttributes.add(attribute[0]);
      }
    });
  });

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: markdownSanitizeSchema.tagNames ?? [],
    ALLOWED_ATTR: [...allowedAttributes],
  });
}

export function createSafeHtmlPreview(value: string): HTMLElement | null {
  const trimmed = value.trim();
  const isCompleteElement =
    /^<([a-z][\w-]*)\b[^>]*>[\s\S]*<\/\1>$/i.test(trimmed) ||
    /^<(?:img|hr|br)\b[^>]*\/?\s*>$/i.test(trimmed);
  if (!isCompleteElement) return null;

  const sanitized = sanitizeRawHtml(value);
  if (!sanitized.trim()) return null;

  const preview = document.createElement("span");
  preview.className = "oghma-html-preview";
  preview.contentEditable = "false";
  preview.dataset.rawHtml = value;
  preview.setAttribute("aria-label", "Rendered HTML. Double-click to show source.");
  preview.innerHTML = sanitized;
  preview.addEventListener("dblclick", () => {
    const showingSource = preview.dataset.showSource === "true";
    preview.dataset.showSource = String(!showingSource);
    preview.textContent = showingSource ? "" : value;
    if (showingSource) preview.innerHTML = sanitized;
  });
  return preview;
}

function rawHtmlDecorations(doc: any) {
  const decorations: Decoration[] = [];

  doc.descendants((parent: any, parentPos: number) => {
    if (!parent.isTextblock) return true;

    const openTags = new Map<string, number[]>();
    parent.forEach((node: any, offset: number) => {
      if (node.type.name !== "html") return;
      const value = String(node.attrs.value ?? "").trim();
      const match = /^<(\/)?([a-z][\w-]*)\s*>$/i.exec(value);
      if (!match) return;
      const tag = match[2].toLowerCase();
      if (!INLINE_HTML_TAGS.has(tag)) return;

      const pos = parentPos + 1 + offset;
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "oghma-html-token-hidden",
        }),
      );

      if (!match[1]) {
        const positions = openTags.get(tag) ?? [];
        positions.push(pos + node.nodeSize);
        openTags.set(tag, positions);
        return;
      }

      const positions = openTags.get(tag);
      const from = positions?.pop();
      if (from !== undefined && from < pos) {
        decorations.push(
          Decoration.inline(from, pos, { class: `oghma-html-${tag}` }),
        );
      }
    });
    return false;
  });

  return DecorationSet.create(doc, decorations);
}

const safeRawHtmlPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations: (state) => rawHtmlDecorations(state.doc),
        nodeViews: {
          html: (node) => {
            const preview = createSafeHtmlPreview(String(node.attrs.value ?? ""));
            if (preview) return { dom: preview };

            const source = document.createElement("span");
            source.dataset.type = "html";
            source.dataset.value = String(node.attrs.value ?? "");
            source.textContent = String(node.attrs.value ?? "");
            return { dom: source };
          },
        },
      },
    }),
);

function iconButton(label: string, className: string, icon: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return button;
}

function removeControlText(button: HTMLButtonElement) {
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!(node.parentElement?.closest("svg"))) textNodes.push(node);
  }
  textNodes.forEach((node) => node.remove());
}

/** Adds the spike-only T3-style controls without changing serialized Markdown. */
export function enhanceMilkdownCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".milkdown-code-block").forEach((block) => {
    const languageButton = block.querySelector<HTMLButtonElement>(".language-button");
    if (languageButton && !languageButton.dataset.oghmaEnhanced) {
      const language = languageButton.childNodes[0]?.textContent?.trim() || "Text";
      const label = LANGUAGE_NAMES[language.toLowerCase()] ?? language;
      block.dataset.oghmaLanguage = language.toLowerCase();
      languageButton.title = `Language: ${label}`;
      languageButton.setAttribute("aria-label", `Code language: ${label}. Change language`);
      languageButton.dataset.oghmaEnhanced = "true";
    }

    const codeMirrorHost = block.querySelector<HTMLElement>(".codemirror-host");
    if (codeMirrorHost) {
      const renderedLines = block.querySelectorAll(".cm-content .cm-line").length;
      const placeholder = block.querySelector<HTMLElement>(
        ".milkdown-code-block-placeholder",
      );
      const sourceLines = (placeholder?.textContent?.split("\n").length ?? 0);
      const lineCount = Math.max(renderedLines, sourceLines, 1);
      codeMirrorHost.style.setProperty(
        "--oghma-code-host-min-height",
        `${lineCount * 1.5 + 1}rem`,
      );
    }

    const controls = block.querySelector<HTMLElement>(".tools-button-group");
    if (!controls) return;

    const content = block.querySelector<HTMLElement>(".cm-content");
    let wrap = controls.querySelector<HTMLButtonElement>(".oghma-code-wrap");
    if (!wrap) {
      wrap = iconButton("Wrap lines", "oghma-code-wrap", WRAP_ICON);
      wrap.setAttribute("aria-pressed", "false");
      wrap.addEventListener("click", () => {
        const pressed = wrap?.getAttribute("aria-pressed") !== "true";
        wrap?.setAttribute("aria-pressed", String(pressed));
        if (wrap) wrap.title = pressed ? "Stop wrapping lines" : "Wrap lines";
        content?.classList.toggle("cm-lineWrapping", pressed);
      });
      controls.prepend(wrap);
    }
    content?.classList.toggle(
      "cm-lineWrapping",
      wrap.getAttribute("aria-pressed") === "true",
    );

    const copy = controls.querySelector<HTMLButtonElement>(
      "button:not(.oghma-code-wrap):not(.preview-toggle-button)",
    );
    if (copy && !copy.dataset.oghmaEnhanced) {
      copy.innerHTML = COPY_ICON;
      copy.title = "Copy code";
      copy.setAttribute("aria-label", "Copy code");
      copy.addEventListener("click", () => {
        copy.innerHTML = CHECK_ICON;
        copy.title = "Copied";
        copy.setAttribute("aria-label", "Code copied");
        window.setTimeout(() => {
          if (!copy.isConnected) return;
          copy.innerHTML = COPY_ICON;
          copy.title = "Copy code";
          copy.setAttribute("aria-label", "Copy code");
        }, 1600);
      });
      copy.dataset.oghmaEnhanced = "true";
    }

    const previewToggle = controls.querySelector<HTMLButtonElement>(
      ".preview-toggle-button",
    );
    if (previewToggle) {
      const controlText = previewToggle.textContent ?? "";
      const label = controlText.includes("Edit")
        ? "Edit diagram source"
        : controlText.includes("Hide")
          ? "Hide diagram preview"
          : previewToggle.getAttribute("aria-label");
      if (label) {
        previewToggle.title = label;
        previewToggle.setAttribute("aria-label", label);
      }
      removeControlText(previewToggle);
    }
  });
}

export default function MilkdownWriteEditor({
  value,
  onChange,
  onSave,
  placeholder = "Start writing...",
  currentNoteId,
  onOpenNote,
}: MilkdownWriteEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerListRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const latestValueRef = useRef(value);
  const lastLocallyEmittedValueRef = useRef<string | null>(null);
  const pickerSelectionRef = useRef({ from: 0, to: 0 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [noteOptions, setNoteOptions] = useState<NoteOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState(0);
  const preview = usePortalStore((state) => state.preview);
  const openPickerRef = useRef<(from: number, to: number) => void>(() => {});

  openPickerRef.current = (from, to) => {
    pickerSelectionRef.current = { from, to };
    setPickerQuery("");
    setSelectedOption(0);
    setPickerOpen(true);
  };

  const filteredNotes = useMemo(() => {
    const query = pickerQuery.trim().toLocaleLowerCase();
    return noteOptions
      .filter((note) => !note.isFolder && note.id !== currentNoteId)
      .filter(
        (note) =>
          !query ||
          (note.title || "Untitled").toLocaleLowerCase().includes(query),
      )
      .slice(0, 12);
  }, [currentNoteId, noteOptions, pickerQuery]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!pickerOpen) return;
    pickerListRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${selectedOption}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [pickerOpen, selectedOption]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPickerLoading(true);
      const query = pickerQuery.trim();
      const params = query
        ? `q=${encodeURIComponent(query)}`
        : "limit=200";
      fetch(`/api/notes?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("Unable to load notes");
          return response.json();
        })
        .then((notes: NoteOption[]) => {
          if (!cancelled) setNoteOptions(notes);
        })
        .catch((error) => {
          if (!cancelled && error.name !== "AbortError") setNoteOptions([]);
        })
        .finally(() => {
          if (!cancelled) setPickerLoading(false);
        });
    }, pickerQuery ? 150 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickerOpen, pickerQuery]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        [CrepeFeature.AI]: false,
        [CrepeFeature.TopBar]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: { text: placeholder },
        [CrepeFeature.TopBar]: {
          buildTopBar: (builder) => {
            builder.getGroup("insert").addItem("note-reference", {
              icon: NOTE_LINK_ICON,
              active: () => false,
              onRun: (ctx) => {
                const { from, to } = ctx.get(editorViewCtx).state.selection;
                openPickerRef.current(from, to);
              },
            });
          },
        },
        [CrepeFeature.CodeMirror]: {
          copyIcon: COPY_ICON,
          copyText: "",
          renderPreview: (language, content, applyPreview) => {
            if (language.toLowerCase() !== "mermaid" || !content.trim()) return null;
            void renderMermaidElement(content)
              .then(applyPreview)
              .catch(() => applyPreview(null));
          },
        },
      },
    });
    crepe.editor.use(safeRawHtmlPlugin);

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        lastLocallyEmittedValueRef.current = markdown;
        onChangeRef.current(markdown, false);
      });
    });

    let observer: MutationObserver | null = null;
    let disposed = false;
    const handleBeforeInput = (event: InputEvent) => {
      if (event.data !== "[") return;
      const view = crepe.editor.ctx.get(editorViewCtx);
      const { from, empty } = view.state.selection;
      if (
        !empty ||
        from < 1 ||
        view.state.doc.textBetween(from - 1, from) !== "["
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      view.dispatch(view.state.tr.delete(from - 1, from));
      openPickerRef.current(from - 1, from - 1);
    };
    root.addEventListener("beforeinput", handleBeforeInput as EventListener, true);
    void crepe.create().then(() => {
      if (disposed || !root.isConnected) {
        void crepe.destroy();
        return;
      }
      crepeRef.current = crepe;
      if (crepe.getMarkdown() !== latestValueRef.current) {
        replaceExternalMarkdown(crepe, latestValueRef.current);
      }
      enhanceMilkdownCodeBlocks(root);
      enhanceNoteReferenceButton(root);
      observer = new MutationObserver(() => {
        enhanceMilkdownCodeBlocks(root);
        enhanceNoteReferenceButton(root);
      });
      observer.observe(root, { childList: true, subtree: true });
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      root.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
      crepeRef.current = null;
      void crepe.destroy();
    };
    // The editor instance owns its initial value; later values use replaceAll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latestValueRef.current = value;
    const crepe = crepeRef.current;
    if (
      !crepe ||
      !shouldApplyExternalMarkdown(value, lastLocallyEmittedValueRef.current) ||
      crepe.getMarkdown() === value
    ) {
      return;
    }
    replaceExternalMarkdown(crepe, value);
  }, [value]);

  const insertNoteReference = (note: NoteOption) => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = pickerSelectionRef.current;
      const safeFrom = Math.min(from, view.state.doc.content.size);
      const safeTo = Math.min(to, view.state.doc.content.size);
      const label = note.title || "Untitled";
      const mark = linkSchema.type(ctx).create({
        href: buildInternalNoteHref(note.id),
        title: null,
      });
      const transaction =
        safeFrom === safeTo
          ? view.state.tr
              .insertText(label, safeFrom)
              .addMark(safeFrom, safeFrom + label.length, mark)
          : view.state.tr.addMark(safeFrom, safeTo, mark);
      view.dispatch(transaction.scrollIntoView());
      view.focus();
    });
    setPickerOpen(false);
  };

  return (
    <div
      className="oghma-milkdown-editor relative h-full min-h-0 overflow-auto bg-app-page"
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSave?.();
        }
      }}
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        const noteId = parseInternalNoteHref(anchor?.getAttribute("href"));
        if (!noteId) return;
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          window.open(buildInternalNoteHref(noteId), "_blank");
        } else {
          onOpenNote?.(noteId);
        }
      }}
      onMouseOver={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        const noteId = parseInternalNoteHref(anchor?.getAttribute("href"));
        if (!anchor || !noteId) return;
        preview.cancelClose();
        preview.setAnchor(anchor);
        preview.setData({ id: noteId });
        preview.open();
      }}
      onMouseOut={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (!parseInternalNoteHref(anchor?.getAttribute("href"))) return;
        preview.scheduleClose();
      }}
    >
      <div ref={rootRef} className="mx-auto min-h-full" />
      {pickerOpen && (
        <div
          className="sticky bottom-4 z-50 mx-auto w-[min(28rem,calc(100%-2rem))] rounded-radius-lg border border-border-subtle bg-surface-elevated p-2 shadow-2xl"
          role="dialog"
          aria-label="Reference a note"
          onKeyDown={(event) => {
            if (event.key === "Escape") setPickerOpen(false);
          }}
        >
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="note-reference-options"
              value={pickerQuery}
              onChange={(event) => {
                setPickerQuery(event.target.value);
                setSelectedOption(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (!filteredNotes.length) return;
                  setSelectedOption((index) =>
                    Math.min(index + 1, filteredNotes.length - 1),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedOption((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Enter" && filteredNotes[selectedOption]) {
                  event.preventDefault();
                  insertNoteReference(filteredNotes[selectedOption]);
                }
              }}
              placeholder="Search notes…"
              className="min-w-0 flex-1 rounded-radius-md border border-border-subtle bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-radius-md text-lg text-text-tertiary hover:bg-subtle hover:text-text"
              aria-label="Close note picker"
            >
              ×
            </button>
          </div>
          <div
            ref={pickerListRef}
            id="note-reference-options"
            className="mt-1 max-h-64 overflow-y-auto"
            role="listbox"
          >
            {pickerLoading ? (
              <p className="px-3 py-4 text-sm text-text-tertiary">
                Loading notes…
              </p>
            ) : filteredNotes.length ? (
              filteredNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  role="option"
                  aria-selected={index === selectedOption}
                  data-option-index={index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertNoteReference(note)}
                  className={`block w-full rounded-radius-sm px-3 py-2 text-left text-sm ${
                    index === selectedOption
                      ? "bg-primary-500/15 text-text"
                      : "text-text-secondary hover:bg-subtle"
                  }`}
                >
                  {note.title || "Untitled"}
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-text-tertiary">
                No matching notes
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
