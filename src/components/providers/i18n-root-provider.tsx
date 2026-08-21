"use client";

import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import I18nProvider from "@/lib/i18n/provider";
import { Locale, normalizeLocale } from "@/locales";
import enDict from "@/locales/en.json";
import {
  LOCALE_STORAGE_KEY,
  SETTINGS_CACHE_KEY,
  type CachedLocalePreference,
  persistClientLocale,
} from "@/lib/i18n/locale-preference";
import { uiCache } from "@/lib/notes/cache";
import { loadLocaleData, type LocaleData } from "@/lib/i18n/locale-data";

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

export function normalizeClientLocale(
  locale: string | null | undefined,
): Locale {
  return normalizeLocale(locale) ?? Locale.EN;
}

function supportedClientLocale(
  locale: string | null | undefined,
): Locale | null {
  return normalizeLocale(locale);
}

/** Read only a complete cache record; corrupt values cannot select a locale. */
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

function readCookieLocale(): string | null {
  try {
    const rawLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_STORAGE_KEY}=`))
      ?.split("=")[1];

    return rawLocale ? decodeURIComponent(rawLocale) : null;
  } catch {
    return null;
  }
}

function readBrowserLocale(): string | null {
  const cookieLocale = readCookieLocale();
  if (cookieLocale) return cookieLocale;

  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
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
  const validatedPrivateLocaleRef = useRef(false);
  const localeVersionRef = useRef(0);
  const chosenLocaleRef = useRef<Locale | null>(null);

  // A server navigation supplies the request's cookie-derived locale before
  // hydration. It stays authoritative only until the visitor picks a language:
  // `router.refresh()` and prefetched route payloads can replay a render made
  // before that choice reached the cookie, and replaying it would silently
  // revert the language the visitor just selected.
  useEffect(() => {
    if (
      chosenLocaleRef.current &&
      chosenLocaleRef.current !== initialLocaleData.locale
    ) {
      return;
    }
    setLocaleData(initialLocaleData);
  }, [initialLocaleData]);

  const handleLocaleChange = useCallback(
    (locale: Locale, dict: LocaleData["dict"]) => {
      localeVersionRef.current += 1;
      chosenLocaleRef.current = locale;
      setLocaleData({ locale, dict });
      void persistClientLocale(locale);
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const localeVersion = localeVersionRef.current;
    const isCurrent = () =>
      !cancelled && localeVersionRef.current === localeVersion;

    const applyLocale = async (nextLocale: Locale) => {
      const nextLocaleData = await loadLocaleData(nextLocale);
      if (!isCurrent()) return false;
      setLocaleData(nextLocaleData);
      return true;
    };

    const loadLocale = async () => {
      try {
        const browserLocale = supportedClientLocale(readBrowserLocale());
        let instantLocale = browserLocale ?? initialLocaleData.locale;

        // Cookie/localStorage is the most recent explicit browser choice. It
        // must win over the slower IndexedDB cache to avoid language flashes.
        if (browserLocale && !(await applyLocale(browserLocale))) return;

        // IndexedDB is only a fallback when the browser has no direct locale
        // preference. It never overrides a cookie or localStorage selection.
        if (!browserLocale) {
          let cached: CachedLocalePreference | undefined;
          try {
            cached = await uiCache.getItem<CachedLocalePreference>(
              SETTINGS_CACHE_KEY,
            );
          } catch {
            // IndexedDB is an optimization only.
          }

          const cachedLocale = readCachedSettings(cached)?.locale;
          if (cachedLocale) {
            instantLocale = cachedLocale;
            if (!(await applyLocale(cachedLocale))) return;
          }
        }
        if (!isCurrent()) return;

        // On authenticated app pages, reconcile once per visit with the saved
        // account setting. This prevents stale browser cache from persisting
        // across pages or devices while avoiding repeated API requests.
        if (
          !shouldRevalidateSettings(pathname) ||
          validatedPrivateLocaleRef.current
        ) {
          return;
        }
        validatedPrivateLocaleRef.current = true;

        const response = await fetch("/api/settings", {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const userLocale = localeFromSettingsResponse(await response.json());
        if (!isCurrent()) return;
        await persistClientLocale(userLocale);
        if (!isCurrent()) return;

        if (userLocale !== instantLocale) {
          await applyLocale(userLocale);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Failed to fetch user settings:", error);
      }
    };

    void loadLocale();
    return () => {
      cancelled = true;
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
      onLocaleChange={handleLocaleChange}
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
