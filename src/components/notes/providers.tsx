'use client';

// providers wrapper for notes editor with Zustand state management
import { ReactNode } from 'react';
import { Toaster } from 'sonner';
import I18nProvider from '@/lib/i18n/provider';
import SearchModal from '@/components/notes/search-modal';
import TrashModal from '@/components/notes/trash-modal';
import PreviewModal from '@/components/notes/preview-modal';
import LinkToolbar from '@/components/notes/link-toolbar';
import EditorWidthSelect from '@/components/notes/editor-width-select';

// import English locale (TODO: make this dynamic based on user preference)
import enLocale from '@/locales/en.json';

interface NotesProvidersProps {
    children: ReactNode;
}

export default function NotesProviders({ children }: NotesProvidersProps) {
    return (
        <I18nProvider locale="en" lngDict={enLocale}>
            {children}
            <SearchModal />
            <TrashModal />
            <PreviewModal />
            <LinkToolbar />
            <EditorWidthSelect />
            <Toaster position="bottom-center" />
        </I18nProvider>
    );
}
