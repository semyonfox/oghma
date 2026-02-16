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
        <>
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
                className="editor-input px-4 md:px-0"
                embeds={embeds}
            />
            
/* Tailwind refactor - list replacement */
<ul className="list-disc pl-6"></ul>
<ol className="list-decimal pl-6"></ol>

/* Tailwind refactor for .editor-input */
<div
  className="pb-40"
  style={{ minHeight: hasMinHeight ? `calc(${height ? height + 'px' : '100vh'} - 14rem)` : undefined }}
></div>

/* Tailwind refactor for headings */
<h1 className="text-4xl font-bold"></h1>
<h2 className="text-3xl font-bold"></h2>
<h3 className="text-2xl font-bold"></h3>
/* Tailwind refactor for links */
<a className="underline inherit"></a>





                



                
`
        </>
    );
};

export default Editor;
