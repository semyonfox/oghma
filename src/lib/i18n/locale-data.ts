import { Locale } from "@/locales";
import en from "@/locales/en.json";

export type LocaleDictionary = Record<string, string>;
export const baseLocaleDictionary: LocaleDictionary = en;

export interface LocaleData {
  locale: Locale;
  dict: LocaleDictionary;
}

type LocaleModule = { default: LocaleDictionary };

const localeLoaders: Record<Locale, () => Promise<LocaleModule>> = {
  [Locale.EN]: async () => ({ default: en }),
  [Locale.GA]: () => import("@/locales/ga.json"),
  [Locale.HI]: () => import("@/locales/hi.json"),
  [Locale.ZH_CN]: () => import("@/locales/zh-CN.json"),
  [Locale.FR_FR]: () => import("@/locales/fr-FR.json"),
  [Locale.ES_ES]: () => import("@/locales/es-ES.json"),
  [Locale.IT_IT]: () => import("@/locales/it-IT.json"),
  [Locale.de_DE]: () => import("@/locales/de-DE.json"),
  [Locale.ru_RU]: () => import("@/locales/ru-RU.json"),
  [Locale.ar]: () => import("@/locales/ar.json"),
  [Locale.nl_NL]: () => import("@/locales/nl-NL.json"),
  [Locale.sv_SE]: () => import("@/locales/sv-SE.json"),
};

/** Load one allowlisted locale dictionary; callers must normalize input first. */
export async function loadLocaleData(locale: Locale): Promise<LocaleData> {
  const module = await localeLoaders[locale]();
  return { locale, dict: module.default };
}
