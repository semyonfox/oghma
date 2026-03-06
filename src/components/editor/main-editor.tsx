// extracted from Notea (MIT License)
import EditTitle from './edit-title';
import Editor, { EditorProps } from './editor';
import Backlinks from './backlinks';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import useUIComposite from '@/lib/notes/state/ui';
import { FC } from 'react';
import { NoteModel } from '@/lib/notes/types/note';
import { EDITOR_SIZE } from '@/lib/notes/types/meta';
import { useKeyboardShortcut } from '@/lib/notes/hooks/use-keyboard-shortcut';
import { useAutoSave } from '@/lib/notes/hooks/use-auto-save';

// internal component that has access to EditorState
const EditorContent: FC<EditorProps & { isPreview?: boolean; className: string }> = ({ 
    className, 
    isPreview, 
    ...props 
}) => {
    const { note, saveNow } = useEditorStore();

    // auto-save to IndexedDB + S3 on content changes (3s debounce)
    useAutoSave(note?.id, note?.content ?? '');

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
> = ({ className, note, isPreview, ...props }) => {
    const {
        settings: { settings },
    } = useUIComposite();
    const editorSize = note?.editorsize ?? settings?.editorsize ?? EDITOR_SIZE.LARGE;
    const editorWidthClass = {
    [EDITOR_SIZE.SMALL]: 'max-w-prose',
    [EDITOR_SIZE.LARGE]: 'max-w-4xl',
    [EDITOR_SIZE.AS_WIDE_AS_POSSIBLE]: 'max-w-4xl md:max-w-full md:mx-20',
}[editorSize] || 'max-w-4xl';

    const articleClassName = `pt-16 md:pt-40 px-6 m-auto h-full ${editorWidthClass}`;

    return (
        <EditorContent className={articleClassName} isPreview={isPreview} {...props} />
    );
};

export default MainEditor;
