// extracted from Notea (MIT License)
import { FC, useEffect, useState } from 'react';
import { use100vh } from 'react-div-100vh';
import LexicalEditor, { LexicalEditorProps } from './lexical-editor';
import { useEditorTheme } from './theme';
import useMounted from '@/lib/notes/hooks/use-mounted';
import Tooltip from './tooltip';
import extensions from './extensions';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import { useToast } from '@/lib/notes/hooks/use-toast';
import { useDictionary } from './dictionary';
import { useEmbeds } from './embeds';

export interface EditorProps extends Pick<LexicalEditorProps, 'readOnly'> {
    isPreview?: boolean;
}

const Editor: FC<EditorProps> = ({ readOnly, isPreview }) => {
    const {
        onSearchLink,
        onCreateLink,
        onClickLink,
        onUploadImage,
        onHoverLink,
        onEditorChange,
        backlinks,
        editorEl,
        note,
    } = useEditorStore();
    const height = use100vh();
    const mounted = useMounted();
    const editorTheme = useEditorTheme();
    const [hasMinHeight, setHasMinHeight] = useState(true);
    const toast = useToast();
    const dictionary = useDictionary();
    const embeds = useEmbeds();

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    return (
        <div style={{ minHeight: hasMinHeight ? `calc(${height ? height + 'px' : '100vh'} - 14rem)` : undefined }} className="pb-40">
            <LexicalEditor
                readOnly={readOnly}
                id={note?.id}
                ref={editorEl}
                value={mounted ? note?.content : ''}
                onChange={onEditorChange}
                placeholder={dictionary.editorPlaceholder}
                theme={editorTheme}
                onUploadImage={(file) => onUploadImage(file, note?.id)}
                onSearchLink={onSearchLink}
                onCreateLink={onCreateLink}
                onClickLink={onClickLink}
                onHoverLink={onHoverLink}
                onShowToast={toast}
                dictionary={dictionary}
                tooltip={Tooltip}
                extensions={extensions}
                className=""
                embeds={embeds}
            />
        </div>
    );
};

export default Editor;
