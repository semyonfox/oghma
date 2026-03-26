// extracted from Notea (MIT License)
import { NOTE_DELETED } from '@/lib/notes/types/meta';
import useNoteStore from '@/lib/notes/state/note';
import useI18n from '@/lib/notes/hooks/use-i18n';

const Inner = () => {
    const { t } = useI18n();
    const { note } = useNoteStore();

    if (note?.deleted !== NOTE_DELETED.DELETED) {
        return null;
    }

    return (
        <div className="mt-10 rounded-none p-2 bg-error-900/20 border border-error-800 text-error-200">
            <span>{t('This page is in trash')}</span>
        </div>
    );
};

export default function DeleteAlert() {
    return <Inner />;
}
