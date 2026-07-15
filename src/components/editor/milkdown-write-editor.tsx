"use client";

import { useEffect, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { renderMermaidElement } from "@/lib/markdown/mermaid";

interface MilkdownWriteEditorProps {
  value: string;
  onChange: (value: string, programmaticUpdate?: boolean) => void;
  onSave?: () => void;
  placeholder?: string;
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

function iconButton(label: string, className: string, icon: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return button;
}

/** Adds the spike-only T3-style controls without changing serialized Markdown. */
export function enhanceMilkdownCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".milkdown-code-block").forEach((block) => {
    const languageButton = block.querySelector<HTMLButtonElement>(".language-button");
    if (languageButton && !languageButton.dataset.oghmaEnhanced) {
      const language = languageButton.childNodes[0]?.textContent?.trim() || "Text";
      const label = LANGUAGE_NAMES[language.toLowerCase()] ?? language;
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

    const controls = block.querySelector<HTMLElement>(".tools-button-group");
    if (!controls || controls.querySelector(".oghma-code-wrap")) return;

    const scroller = block.querySelector<HTMLElement>(".cm-scroller");
    const wrap = iconButton("Wrap lines", "oghma-code-wrap", WRAP_ICON);
    wrap.setAttribute("aria-pressed", "false");
    wrap.addEventListener("click", () => {
      const pressed = wrap.getAttribute("aria-pressed") !== "true";
      wrap.setAttribute("aria-pressed", String(pressed));
      wrap.title = pressed ? "Stop wrapping lines" : "Wrap lines";
      scroller?.classList.toggle("oghma-code-lines-wrapped", pressed);
    });
    controls.prepend(wrap);

    const copy = controls.querySelector<HTMLButtonElement>("button:not(.oghma-code-wrap)");
    if (copy) {
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
  const externalValueRef = useRef<string | null>(null);
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

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        const programmaticUpdate = externalValueRef.current === markdown;
        if (programmaticUpdate) externalValueRef.current = null;
        onChangeRef.current(markdown, programmaticUpdate);
      });
    });

    let observer: MutationObserver | null = null;
    void crepe.create().then(() => {
      if (!root.isConnected) return;
      crepeRef.current = crepe;
      if (crepe.getMarkdown() !== latestValueRef.current) {
        externalValueRef.current = latestValueRef.current;
        crepe.editor.action(replaceAll(latestValueRef.current));
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
    externalValueRef.current = value;
    crepe.editor.action(replaceAll(value));
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
