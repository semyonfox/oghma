"use client";

import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import I18nProvider from "@/lib/i18n/provider";
import { Locale, normalizeLocale } from "@/locales";
import enDict from "@/locales/en.json";
import { uiCache } from "@/lib/notes/cache";
import { loadLocaleData, type LocaleData } from "@/lib/i18n/locale-data";

const SETTINGS_CACHE_KEY = "settings-cache";
const LOCALE_STORAGE_KEY = "ogma-locale";
// revalidate from network after 10 min, but always serve cache instantly
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const defaultLocaleData: LocaleData = { locale: Locale.EN, dict: enDict };

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
  locale: Locale;
  cachedAt: number;
}

interface Props {
  children: ReactNode;
  initialLocaleData?: LocaleData;
}

function localeFromSettingsResponse(value: unknown): Locale {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Locale.EN;
  }
  return normalizeLocale((value as { locale?: unknown }).locale) ?? Locale.EN;
}

export function resolveStoredLocale(value: unknown): Locale {
  return normalizeLocale(value) ?? Locale.EN;
}

/** Read only a complete, current cache record; stale/corrupt data revalidates. */
export function readCachedSettings(value: unknown): CachedSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const cached = value as { locale?: unknown; cachedAt?: unknown };
  const locale = normalizeLocale(cached.locale);
  const cachedAt = cached.cachedAt;
  if (!locale || typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) {
    return null;
  }

  return { locale, cachedAt };
}

function cookieLocale(): Locale | null {
  const encoded = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_STORAGE_KEY}=`))
    ?.split("=")[1];
  if (!encoded) return null;

  try {
    return normalizeLocale(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

function I18nRootProviderContent({
  children,
  initialLocaleData = defaultLocaleData,
}: Props) {
  const pathname = usePathname();
  const [localeData, setLocaleData] = useState<LocaleData>(initialLocaleData);

  // A server navigation may supply a newer cookie-derived locale. Keep that
  // authoritative input in sync with the provider's immediate local updates.
  useEffect(() => {
    setLocaleData(initialLocaleData);
  }, [initialLocaleData]);

  const setActiveLocale = useCallback(
    (locale: Locale, dict: LocaleData["dict"]) => {
      setLocaleData({ locale, dict });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const loadLocale = async () => {
      try {
        const browserLocale =
          cookieLocale() ?? localStorage.getItem(LOCALE_STORAGE_KEY);

        // Cached settings only avoid an unnecessary private-route fetch. The
        // server-rendered locale and an explicit browser preference win.
        const cached = readCachedSettings(
          await uiCache.getItem<unknown>(SETTINGS_CACHE_KEY),
        );
        const instantLocale =
          normalizeLocale(browserLocale) ?? initialLocaleData.locale;
        if (instantLocale !== initialLocaleData.locale) {
          const data = await loadLocaleData(instantLocale);
          if (disposed) return;
          setLocaleData(data);
        }

        // Public pages use the locale cookie/cache and do not need authenticated
        // settings. Private app pages periodically reconcile with the server.
        if (!shouldRevalidateSettings(pathname)) return;

        // skip revalidation if cache is still fresh
        if (
          cached &&
          Date.now() - cached.cachedAt >= 0 &&
          Date.now() - cached.cachedAt <= SETTINGS_CACHE_TTL_MS
        ) {
          return;
        }

        const response = await fetch("/api/settings", { signal: controller.signal });
        if (!response.ok) return;

        const settings: unknown = await response.json();
        const userLocale = localeFromSettingsResponse(settings);

        if (disposed) return;

        await uiCache.setItem<CachedSettings>(SETTINGS_CACHE_KEY, {
          locale: userLocale,
          cachedAt: Date.now(),
        });
        if (disposed) return;
        localStorage.setItem(LOCALE_STORAGE_KEY, userLocale);
        document.cookie = `${LOCALE_STORAGE_KEY}=${userLocale}; path=/; max-age=31536000; samesite=lax`;

        // only re-render if locale actually changed
        if (userLocale !== (instantLocale ?? Locale.EN)) {
          const data = await loadLocaleData(userLocale);
          if (!disposed) setLocaleData(data);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Failed to fetch user settings:", error);
      }
    };

    void loadLocale();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [initialLocaleData.locale, pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = localeData.locale;
    root.dir = localeData.locale.toLowerCase().startsWith("ar") ? "rtl" : "ltr";
  }, [localeData.locale]);

  return (
    <I18nProvider
      locale={localeData.locale}
      lngDict={localeData.dict}
      onLocaleChange={setActiveLocale}
    >
      {children}
    </I18nProvider>
  );
}

export default function I18nRootProvider({
  children,
  initialLocaleData = defaultLocaleData,
}: Props) {
  return (
    <Suspense
      fallback={
        <I18nProvider
          locale={initialLocaleData.locale}
          lngDict={initialLocaleData.dict}
        >
          {children}
        </I18nProvider>
      }
    >
      <I18nRootProviderContent initialLocaleData={initialLocaleData}>
        {children}
      </I18nRootProviderContent>
    </Suspense>
  );
}
