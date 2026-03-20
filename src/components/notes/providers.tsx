'use client';

// providers wrapper for notes editor with Zustand state management
import { ReactNode, Suspense } from 'react';
import { Toaster } from 'sonner';
import I18nProvider from '@/lib/i18n/provider';
import { useLocaleLoader } from '@/lib/hooks/useLocaleLoader';
import { Locale } from '@/locales';
import SearchModal from '@/components/notes/search-modal';
import TrashModal from '@/components/notes/trash-modal';
import PreviewModal from '@/components/notes/preview-modal';
import LinkToolbar from '@/components/notes/link-toolbar';
import EditorWidthSelect from '@/components/notes/editor-width-select';
import CanvasImportToast from '@/components/CanvasImportToast';
import { useCanvasImportStatus } from '@/hooks/useCanvasImportStatus';

interface NotesProvidersProps {
    children: ReactNode;
}

function NotesProvidersContent({ children }: NotesProvidersProps) {
    const [localeData, isLoading] = useLocaleLoader(Locale.EN);
    const { progress, showToast, isImporting, onToastClose } = useCanvasImportStatus();

    const sharedUI = (
        <>
            <SearchModal />
            <TrashModal />
            <PreviewModal />
            <LinkToolbar />
            <EditorWidthSelect />
            <Toaster position="bottom-center" />
            <CanvasImportToast
                show={showToast}
                onClose={onToastClose}
                progress={progress}
                onViewLogs={() => {
                    window.location.href = '/settings';
                }}
            />
        </>
    );

    if (!localeData) {
        return (
            <I18nProvider locale={Locale.EN} lngDict={{}}>
                {children}
                {sharedUI}
            </I18nProvider>
        );
    }

    return (
        <I18nProvider locale={localeData.locale} lngDict={localeData.dict}>
            {children}
            {sharedUI}
        </I18nProvider>
    );
}

export default function NotesProviders({ children }: NotesProvidersProps) {
    return (
        <Suspense fallback={
            <I18nProvider locale={Locale.EN} lngDict={{}}>
                {children}
                <Toaster position="bottom-center" />
            </I18nProvider>
        }>
            <NotesProvidersContent>{children}</NotesProvidersContent>
        </Suspense>
    );
}
