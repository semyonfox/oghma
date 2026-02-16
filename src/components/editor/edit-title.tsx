// extracted from Notea (MIT License)
import { TextareaAutosize } from '@mui/material';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { has } from 'lodash';

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

    return (
        <h1 className="text-3xl mb-8">
            <TextareaAutosize
                ref={inputRef}
                dir="auto"
                readOnly={readOnly}
                className="outline-none w-full resize-none block bg-transparent"
                placeholder={t('New Page')}
                defaultValue={note?.title}
                key={note?.id}
                onKeyDown={onInputTitle}
                onChange={onTitleChange}
                maxLength={128}
                autoFocus={autoFocus}
            />
        </h1>
    );
};

export default EditTitle;
