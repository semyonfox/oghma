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
  persistClientLocale,
  readClientLocale,
} from "@/lib/i18n/locale-preference";
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

interface Props {
  children: ReactNode;
  initialLocaleData?: LocaleData;
}

/**
 * Null means the account has never stored a language, which is different from
 * an account that chose English. The API omits the key rather than defaulting
 * it so this distinction survives the request.
 */
export function localeFromSettingsResponse(value: unknown): Locale | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return normalizeLocale((value as { locale?: unknown }).locale);
}

/** Best effort: the visible language already holds without this succeeding. */
async function adoptAccountLocale(
  locale: Locale,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`settings API returned ${response.status}`);
    }
    return true;
  } catch (error) {
    if (signal.aborted) return false;
    console.warn("Failed to adopt the browser language preference:", error);
    return false;
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
      persistClientLocale(locale);
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
        const browserLocale = readClientLocale();
        const instantLocale = browserLocale ?? initialLocaleData.locale;

        // The server rendered from this same cookie, so this only changes
        // anything when the markup came from a cache or another tab picked a
        // different language since this page was built.
        if (browserLocale && !(await applyLocale(browserLocale))) return;
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

        const accountLocale = localeFromSettingsResponse(await response.json());
        if (!isCurrent()) return;

        // An account with no stored language adopts the visitor's own choice
        // instead of resetting it. Picking a language before signing in is
        // still a choice, and it should follow them to their other devices.
        if (!accountLocale) {
          if (browserLocale) {
            const adopted = await adoptAccountLocale(
              browserLocale,
              controller.signal,
            );
            if (!adopted) validatedPrivateLocaleRef.current = false;
          }
          return;
        }

        persistClientLocale(accountLocale);

        if (accountLocale !== instantLocale) {
          await applyLocale(accountLocale);
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
