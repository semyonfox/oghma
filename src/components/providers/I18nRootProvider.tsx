'use client';

import { ReactNode, Suspense, useEffect, useState } from 'react';
import I18nProvider from '@/lib/i18n/provider';
import { Locale } from '@/locales';

interface Props {
    children: ReactNode;
}

function I18nRootProviderContent({ children }: Props) {
    const [localeData, setLocaleData] = useState<{ locale: string; dict: Record<string, string> } | null>(null);

    useEffect(() => {
        const loadLocale = async () => {
            try {
                // Try to fetch user's saved locale preference
                const response = await fetch('/api/settings');
                if (response.ok) {
                    const settings = await response.json();
                    const userLocale = settings.locale || Locale.EN;
                    const module = await import(`@/locales/${userLocale}.json`);
                    setLocaleData({
                        locale: userLocale,
                        dict: module.default,
                    });
                    return;
                }
            } catch (error) {
                console.warn('Failed to fetch user settings:', error);
            }

            // Always fall back to English
            try {
                const module = await import(`@/locales/en.json`);
                setLocaleData({
                    locale: Locale.EN,
                    dict: module.default,
                });
            } catch (error) {
                console.error('Failed to load English locale:', error);
                // Last resort: empty English (t will just return the key)
                setLocaleData({
                    locale: Locale.EN,
                    dict: {},
                });
            }
        };

        loadLocale();
    }, []);

    // While loading, show children immediately with English context
    // This ensures components can use useI18n() without waiting
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
