// extracted from Notea (MIT License)
import EditTitle from "./edit-title";
import Editor, { EditorProps } from "./editor";
import Backlinks from "./backlinks";
import useEditorStore from "@/lib/notes/state/editor.zustand";
import { FC } from "react";
import { NoteModel } from "@/lib/notes/types/note";
import { useKeyboardShortcut } from "@/lib/notes/hooks/use-keyboard-shortcut";
import { useAutoSave } from "@/lib/notes/hooks/use-auto-save";

// internal component that has access to EditorState
const EditorContent: FC<
  EditorProps & { isPreview?: boolean; className: string }
> = ({ className, isPreview, ...props }) => {
  const { note, saveNow } = useEditorStore();

  // auto-save to IndexedDB + S3 on content changes (3s debounce)
  useAutoSave(note?.id, note?.content ?? "");

  // setup Ctrl+S save handler
  useKeyboardShortcut({
    onSave: saveNow,
    enabled: !props.readOnly,
  });

  return (
    <article className={className}>
      <EditTitle readOnly={props.readOnly} />
      <Editor isPreview={isPreview} {...props} />
      {!isPreview && <Backlinks />}
    </article>
  );
};

const MainEditor: FC<
  EditorProps & {
    note?: NoteModel;
    isPreview?: boolean;
    className?: string;
  }
> = ({ className: _className, note: _note, isPreview, ...props }) => {
  const articleClassName = "pt-16 md:pt-40 px-6 m-auto h-full max-w-[95ch]";

  return (
    <EditorContent
      className={articleClassName}
      isPreview={isPreview}
      {...props}
    />
  );
};

export default MainEditor;
