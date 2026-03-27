"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import I18nProvider from "@/lib/i18n/provider";
import { Locale } from "@/locales";
import enDict from "@/locales/en.json";

interface Props {
  children: ReactNode;
}

function I18nRootProviderContent({ children }: Props) {
  const [localeData, setLocaleData] = useState<{
    locale: string;
    dict: Record<string, string>;
  }>({
    locale: Locale.EN,
    dict: enDict,
  });

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          const userLocale = settings.locale || Locale.EN;

          // only dynamically import if the user chose a non-English locale
          if (userLocale !== Locale.EN) {
            const module = await import(`@/locales/${userLocale}.json`);
            setLocaleData({
              locale: userLocale,
              dict: module.default,
            });
          }
        }
      } catch (error) {
        console.warn("Failed to fetch user settings:", error);
      }
    };

    loadLocale();
  }, []);

  return (
    <I18nProvider locale={localeData.locale} lngDict={localeData.dict}>
      {children}
    </I18nProvider>
  );
}

export default function I18nRootProvider({ children }: Props) {
  return (
    <Suspense
      fallback={
        <I18nProvider locale={Locale.EN} lngDict={enDict}>
          {children}
        </I18nProvider>
      }
    >
      <I18nRootProviderContent>{children}</I18nRootProviderContent>
    </Suspense>
  );
}
