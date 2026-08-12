"use client";

// adapted from notea: https://github.com/QingWei-Li/notea
// original file: libs/web/utils/i18n-provider.tsx

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import rosetta from "rosetta";
import pupa from "pupa";
import { Locale, supportedLocales } from "@/locales";
import type { LocaleDictionary } from "@/lib/i18n/locale-data";

export const defaultLanguage = Locale.EN;

export const languages = supportedLocales;

export type Translate = (
  key: string | readonly (string | number)[],
  params?: Record<string, unknown>,
) => string;

export interface ContextProps {
  activeLocale: Locale;
  t: Translate;
  locale: (locale: Locale, dictionary: LocaleDictionary) => void;
}

export const I18nContext = createContext<ContextProps | null>(null);

interface Props {
  children: ReactNode;
  locale: Locale;
  lngDict: LocaleDictionary;
  onLocaleChange?: (locale: Locale, dictionary: LocaleDictionary) => void;
}

export default function I18nProvider({
  children,
  locale,
  lngDict,
  onLocaleChange,
}: Props) {
  const i18n = useMemo(() => rosetta<LocaleDictionary>(), []);
  const [localeData, setLocaleData] = useState({ locale, dict: lngDict });

  // Parent changes (initial cache/server reconciliation) remain authoritative.
  // A selector change updates local state immediately, then persists separately.
  useEffect(() => {
    setLocaleData((current) =>
      current.locale === locale && current.dict === lngDict
        ? current
        : { locale, dict: lngDict },
    );
  }, [locale, lngDict]);

  // This instance belongs to this provider, so nested editor/public providers
  // cannot overwrite one another's active locale.
  i18n.set(localeData.locale, localeData.dict);
  i18n.locale(localeData.locale);

  const t = useCallback<Translate>(
    (key, params = {}) => {
      const keyParts = typeof key === "string" ? [key] : [...key];
      const translated = i18n.t(keyParts, params);
      if (translated) {
        return Object.keys(params).length > 0
          ? pupa(translated, params)
          : translated;
      }
      return pupa(keyParts.join(""), params);
    },
    [i18n],
  );

  const setLocale = useCallback(
    (nextLocale: Locale, dictionary: LocaleDictionary) => {
      setLocaleData({ locale: nextLocale, dict: dictionary });
      onLocaleChange?.(nextLocale, dictionary);
    },
    [onLocaleChange],
  );

  const contextValue = useMemo<ContextProps>(
    () => ({ activeLocale: localeData.locale, t, locale: setLocale }),
    [localeData.locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
  );
}
