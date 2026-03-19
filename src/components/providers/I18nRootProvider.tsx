'use client';

import { ReactNode, Suspense } from 'react';
import I18nProvider from '@/lib/i18n/provider';
import { useLocaleLoader } from '@/lib/hooks/useLocaleLoader';
import { Locale } from '@/locales';

interface Props {
    children: ReactNode;
}

function I18nRootProviderContent({ children }: Props) {
    const [localeData, isLoading] = useLocaleLoader(Locale.EN);

    // Show children with default English while loading
    if (!localeData) {
        return (
            <I18nProvider locale={Locale.EN} lngDict={{}}>
                {children}
            </I18nProvider>
        );
    }

    return (
        <I18nProvider locale={localeData.locale} lngDict={localeData.dict}>
            {children}
        </I18nProvider>
    );
}

export default function I18nRootProvider({ children }: Props) {
    return (
        <Suspense fallback={
            <I18nProvider locale={Locale.EN} lngDict={{}}>
                {children}
            </I18nProvider>
        }>
            <I18nRootProviderContent>{children}</I18nRootProviderContent>
        </Suspense>
    );
}
