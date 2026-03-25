// extracted from Notea (MIT License)
import useI18n from '@/lib/notes/hooks/use-i18n';

import { useRouter, useSearchParams } from 'next/navigation';
import {
    FC,
    useCallback,
    useMemo,
    KeyboardEvent,
    useRef,
    useEffect,
    ChangeEvent,
} from 'react';
import useEditorStore from '@/lib/notes/state/editor.zustand';

const EditTitle: FC<{ readOnly?: boolean }> = ({ readOnly }) => {
    const { editorEl, onNoteChange, note } = useEditorStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const onInputTitle = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key.toLowerCase() === 'enter') {
                event.stopPropagation();
                event.preventDefault();
                editorEl.current?.focusAtEnd();
            }
        },
        [editorEl]
    );

    const onTitleChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
            const title = event.target.value;
            onNoteChange({ title })
                ?.catch((v) => console.error('Error whilst changing title: %O', v));
        },
        [onNoteChange]
    );

    const autoFocus = useMemo(() => searchParams?.has('new'), [searchParams]);
    const { t } = useI18n();

    const handleTextareaChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
        onTitleChange(e);
    }, [onTitleChange]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 300) + 'px';
        }
    }, [note?.id]);

    return (
        <h1 className="text-3xl mb-8">
            <textarea
                ref={inputRef}
                dir="auto"
                readOnly={readOnly}
                className="outline-none w-full resize-none block bg-transparent font-inherit overflow-hidden"
                style={{ lineHeight: 'inherit', padding: 0 }}
                placeholder={t('New Page')}
                defaultValue={note?.title}
                key={note?.id}
                onKeyDown={onInputTitle}
                onChange={handleTextareaChange}
                maxLength={128}
                autoFocus={autoFocus}
            />
        </h1>
    );
};

export default EditTitle;
