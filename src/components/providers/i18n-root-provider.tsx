"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import I18nProvider from "@/lib/i18n/provider";
import { Locale } from "@/locales";
import enDict from "@/locales/en.json";
import { uiCache } from "@/lib/notes/cache";

const SETTINGS_CACHE_KEY = "settings-cache";
const LOCALE_STORAGE_KEY = "ogma-locale";
// revalidate from network after 10 min, but always serve cache instantly
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;

const PRIVATE_APP_PATHS = [
  "/analytics",
  "/calendar",
  "/chat",
  "/dashboard",
  "/notes",
  "/quiz",
  "/settings",
  "/trash",
  "/upload",
];

export function shouldRevalidateSettings(pathname: string) {
  return PRIVATE_APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

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
  const pathname = usePathname();
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
        const cookieLocale = document.cookie
          .split("; ")
          .find((row) => row.startsWith(`${LOCALE_STORAGE_KEY}=`))
          ?.split("=")[1];
        const browserLocale =
          (cookieLocale ? decodeURIComponent(cookieLocale) : null) ||
          localStorage.getItem(LOCALE_STORAGE_KEY);

        // serve cached locale immediately — no waiting for network
        const cached = await uiCache.getItem<CachedSettings>(SETTINGS_CACHE_KEY);
        const instantLocale = cached?.locale || browserLocale;
        if (instantLocale && instantLocale !== Locale.EN) {
          setLocaleData(await loadLocaleDict(instantLocale));
        }

        // Public pages use the locale cookie/cache and do not need authenticated
        // settings. Private app pages periodically reconcile with the server.
        if (!shouldRevalidateSettings(pathname)) return;

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
        localStorage.setItem(LOCALE_STORAGE_KEY, userLocale);
        document.cookie = `${LOCALE_STORAGE_KEY}=${userLocale}; path=/; max-age=31536000; samesite=lax`;

        // only re-render if locale actually changed
        if (userLocale !== (instantLocale ?? Locale.EN)) {
          setLocaleData(await loadLocaleDict(userLocale));
        }
      } catch (error) {
        console.warn("Failed to fetch user settings:", error);
      }
    };

    loadLocale();
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = localeData.locale;
    root.dir = localeData.locale.toLowerCase().startsWith("ar") ? "rtl" : "ltr";
  }, [localeData.locale]);

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
