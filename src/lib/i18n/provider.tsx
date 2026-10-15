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
import { Locale } from "@/locales";
import type { LocaleDictionary } from "@/lib/i18n/locale-data";
import { translate, type Translate } from "@/lib/i18n/translate";

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

  // each provider reads its own dictionary, so nested editor/public providers
  // cannot overwrite one another's active locale
  const activeDictionary = localeData.dict;
  const t = useCallback<Translate>(
    (key, params) => translate(activeDictionary, key, params),
    [activeDictionary],
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
