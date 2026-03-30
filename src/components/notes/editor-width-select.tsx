"use client";

// editor width select - per-note width selection
// ported from Notea (MIT License) - MUI Menu replaced with Tailwind dropdown
import { FC, useCallback } from "react";
import usePortalStore from "@/lib/notes/state/portal";
import useNoteStore from "@/lib/notes/state/note";
import { EDITOR_SIZE } from "@/lib/notes/types/meta";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { CheckIcon } from "@heroicons/react/24/outline";

const EditorWidthSelect: FC = () => {
  const { t } = useI18n();
  const { editorWidthSelect } = usePortalStore();
  const { mutateNote } = useNoteStore();

  const handleSelect = useCallback(
    async (size: EDITOR_SIZE | null) => {
      const note = editorWidthSelect.data;
      if (!note?.id) return;
      await mutateNote(note.id, { editorsize: size });
      editorWidthSelect.close();
    },
    [editorWidthSelect, mutateNote],
  );

  if (!editorWidthSelect.visible || !editorWidthSelect.anchor) {
    return null;
  }

  const rect = editorWidthSelect.anchor.getBoundingClientRect();
  const top = rect.bottom + 4;
  const right = window.innerWidth - rect.right;
  const currentSize = editorWidthSelect.data?.editorsize;

  const options = [
    { label: t("Small"), value: EDITOR_SIZE.SMALL },
    { label: t("Large"), value: EDITOR_SIZE.LARGE },
    { label: t("Default"), value: null },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => editorWidthSelect.close()}
      />
      <div
        className="fixed z-50 w-40 bg-surface-elevated rounded-lg shadow-xl border border-border-subtle overflow-hidden py-1"
        style={{ top, right }}
      >
        {options.map((option) => (
          <button
            key={option.label}
            onClick={() => handleSelect(option.value)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-text-tertiary hover:bg-white/5 transition-colors"
          >
            <span>{option.label}</span>
            {currentSize === option.value && (
              <CheckIcon className="w-4 h-4 text-primary-400" />
            )}
          </button>
        ))}
      </div>
    </>
  );
};

export default EditorWidthSelect;
