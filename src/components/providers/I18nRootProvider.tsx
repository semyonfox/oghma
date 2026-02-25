'use client';

import { ReactNode } from 'react';
import I18nProvider from '@/lib/i18n/provider';
import enLocale from '@/locales/en.json';

interface Props {
    children: ReactNode;
}

export default function I18nRootProvider({ children }: Props) {
    // Defaulting to English. In a real app, you might get this from a cookie or localStorage.
    return (
        <I18nProvider locale="en" lngDict={enLocale}>
            {children}
        </I18nProvider>
    );
}
