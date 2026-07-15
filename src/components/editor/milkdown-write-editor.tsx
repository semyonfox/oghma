"use client";

import { useEffect, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import { Slice } from "@milkdown/kit/prose/model";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import DOMPurify from "dompurify";
import { renderMermaidElement } from "@/lib/markdown/mermaid";
import { markdownSanitizeSchema } from "@/lib/markdown/sanitize-schema";

interface MilkdownWriteEditorProps {
  value: string;
  onChange: (value: string, programmaticUpdate?: boolean) => void;
  onSave?: () => void;
  placeholder?: string;
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

const LANGUAGE_ICONS: Record<string, string> = {
  js: "JS",
  javascript: "JS",
  jsx: "JSX",
  ts: "TS",
  typescript: "TS",
  tsx: "TSX",
  html: "</>",
  css: "#",
  json: "{}",
  py: "Py",
  python: "Py",
  diff: "±",
  mermaid: "◇",
  sh: ">_",
  bash: ">_",
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
      const icon = LANGUAGE_ICONS[language.toLowerCase()];
      if (icon && languageButton.firstChild) {
        const badge = document.createElement("span");
        badge.className = "oghma-code-language-icon";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = icon;
        languageButton.replaceChild(badge, languageButton.firstChild);
      }
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
}: MilkdownWriteEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const latestValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
        onChangeRef.current(markdown, false);
      });
    });

    let observer: MutationObserver | null = null;
    void crepe.create().then(() => {
      if (!root.isConnected) return;
      crepeRef.current = crepe;
      if (crepe.getMarkdown() !== latestValueRef.current) {
        replaceExternalMarkdown(crepe, latestValueRef.current);
      }
      enhanceMilkdownCodeBlocks(root);
      observer = new MutationObserver(() => enhanceMilkdownCodeBlocks(root));
      observer.observe(root, { childList: true, subtree: true });
    });

    return () => {
      observer?.disconnect();
      crepeRef.current = null;
      void crepe.destroy();
    };
    // The editor instance owns its initial value; later values use replaceAll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latestValueRef.current = value;
    const crepe = crepeRef.current;
    if (!crepe || crepe.getMarkdown() === value) return;
    replaceExternalMarkdown(crepe, value);
  }, [value]);

  return (
    <div
      className="oghma-milkdown-editor h-full min-h-0 overflow-auto bg-app-page"
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSave?.();
        }
      }}
    >
      <div ref={rootRef} className="mx-auto min-h-full" />
    </div>
  );
}
