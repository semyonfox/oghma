"use client";

// adapted from notea: https://github.com/QingWei-Li/notea
// original file: libs/web/utils/i18n-provider.tsx

import { createContext, useState, useRef, useEffect, ReactNode } from "react";
import rosetta, { Rosetta } from "rosetta";
import pupa from "pupa";

const i18n = rosetta<Record<string, string>>();

// default to English locale
export const defaultLanguage = "en";

// supported locales - update this when adding new locale files
export const languages = [
  "en",
  "ga",
  "hi",
  "zh-CN",
  "fr-FR",
  "es-ES",
  "it-IT",
  "de-DE",
  "ru-RU",
  "ar",
  "nl-NL",
  "sv-SE",
];

export interface ContextProps {
  activeLocale: string;
  t: Rosetta<Record<string, string>>["t"];
  locale: (l: string, dict: Record<string, string>) => void;
}

export const I18nContext = createContext<ContextProps>({} as ContextProps);

// default language
i18n.locale(defaultLanguage);

interface Props {
  children: ReactNode;
  locale: string;
  lngDict: Record<string, string>;
}

export default function I18nProvider({ children, locale, lngDict }: Props) {
  const activeLocaleRef = useRef(locale || defaultLanguage);
  const [, setTick] = useState(0);
  const firstRender = useRef(true);

  const i18nWrapper: ContextProps = {
    activeLocale: activeLocaleRef.current,
    t: (key, ...args) => {
      // always try rosetta lookup first (handles dotted keys like "chat.title")
      const result = i18n.t(Array.isArray(key) ? key : [key], ...args);
      const params = args[0] ?? {};
      const hasParams =
        typeof params === "object" && Object.keys(params).length > 0;
      if (result) {
        // rosetta uses {{var}} but our translations use {var} (pupa format),
        // so always run pupa when params are provided to interpolate single-brace vars
        return hasParams ? pupa(result, params) : result;
      }
      // fallback: treat the key itself as the English text (with pupa interpolation)
      return pupa(Array.isArray(key) ? key.join("") : key, params);
    },
    locale: (l: Props["locale"], dict: Props["lngDict"]) => {
      i18n.locale(l);
      activeLocaleRef.current = l;
      if (dict) {
        i18n.set(l, dict);
      }
      // force rerender to update view
      setTick((tick) => tick + 1);
    },
  };

  // for initial SSR render
  if (locale && firstRender.current === true) {
    firstRender.current = false;
    i18nWrapper.locale(locale, lngDict);
  }

  // when locale is updated
  useEffect(() => {
    if (locale) {
      i18nWrapper.locale(locale, lngDict);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lngDict, locale]);

  return (
    <I18nContext.Provider value={i18nWrapper}>{children}</I18nContext.Provider>
  );
}
