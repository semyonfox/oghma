"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import I18nProvider from "@/lib/i18n/provider";
import { Locale } from "@/locales";
import enDict from "@/locales/en.json";
import { uiCache } from "@/lib/notes/cache";

const SETTINGS_CACHE_KEY = "settings-cache";
// revalidate from network after 10 min, but always serve cache instantly
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedSettings {
  locale: string;
  cachedAt: number;
}

interface Props {
  children: ReactNode;
}

async function loadLocaleDict(locale: string) {
  if (locale === Locale.EN)
    return { locale, dict: enDict as Record<string, string> };
  const module = await import(`@/locales/${locale}.json`);
  return { locale, dict: module.default as Record<string, string> };
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
        // serve cached locale immediately — no waiting for network
        const cached = await uiCache.getItem<CachedSettings>(SETTINGS_CACHE_KEY);
        if (cached?.locale && cached.locale !== Locale.EN) {
          setLocaleData(await loadLocaleDict(cached.locale));
        }

        // skip revalidation if cache is still fresh
        const isStale =
          !cached || Date.now() - cached.cachedAt > SETTINGS_CACHE_TTL_MS;
        if (!isStale) return;

        const response = await fetch("/api/settings");
        if (!response.ok) return;

        const settings = await response.json();
        const userLocale = settings.locale || Locale.EN;

        await uiCache.setItem<CachedSettings>(SETTINGS_CACHE_KEY, {
          locale: userLocale,
          cachedAt: Date.now(),
        });

        // only re-render if locale actually changed
        if (userLocale !== (cached?.locale ?? Locale.EN)) {
          setLocaleData(await loadLocaleDict(userLocale));
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
