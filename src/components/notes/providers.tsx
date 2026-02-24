'use client';

// providers wrapper for notes editor with all required state containers
import { ReactNode } from 'react';
import { SnackbarProvider } from 'notistack';
import I18nProvider from '@/lib/i18n/provider';
import UIState from '@/lib/notes/state/ui';
import NoteState from '@/lib/notes/state/note';
import NoteTreeState from '@/lib/notes/state/tree';
import PortalState from '@/lib/notes/state/portal';
import SearchState from '@/lib/notes/state/search';
import TrashState from '@/lib/notes/state/trash';
import CsrfTokenState from '@/lib/notes/state/csrf-token';
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
            <SnackbarProvider maxSnack={3}>
                <CsrfTokenState.Provider>
                    <UIState.Provider>
                        <NoteTreeState.Provider>
                            <NoteState.Provider>
                                <SearchState.Provider>
                                    <TrashState.Provider>
                                        <PortalState.Provider>

                                                {children}
                                                <SearchModal />
                                                <TrashModal />
                                                <PreviewModal />
                                                <LinkToolbar />
                                                <EditorWidthSelect />

                                        </PortalState.Provider>
                                    </TrashState.Provider>
                                </SearchState.Provider>
                            </NoteState.Provider>
                        </NoteTreeState.Provider>
                    </UIState.Provider>
                </CsrfTokenState.Provider>
            </SnackbarProvider>
        </I18nProvider>
    );
}
