import "server-only";

import { cookies, headers } from "next/headers";
import pupa from "pupa";
import { Locale } from "@/locales";
import en from "@/locales/en.json";
import ga from "@/locales/ga.json";
import hi from "@/locales/hi.json";
import zhCN from "@/locales/zh-CN.json";
import frFR from "@/locales/fr-FR.json";
import esES from "@/locales/es-ES.json";
import itIT from "@/locales/it-IT.json";
import deDE from "@/locales/de-DE.json";
import ruRU from "@/locales/ru-RU.json";
import ar from "@/locales/ar.json";
import nlNL from "@/locales/nl-NL.json";
import svSE from "@/locales/sv-SE.json";

const dictionaries: Record<Locale, Record<string, string>> = {
  [Locale.EN]: en,
  [Locale.GA]: ga,
  [Locale.HI]: hi,
  [Locale.ZH_CN]: zhCN,
  [Locale.FR_FR]: frFR,
  [Locale.ES_ES]: esES,
  [Locale.IT_IT]: itIT,
  [Locale.de_DE]: deDE,
  [Locale.ru_RU]: ruRU,
  [Locale.ar]: ar,
  [Locale.nl_NL]: nlNL,
  [Locale.sv_SE]: svSE,
};

const localeValues = new Set<string>(Object.values(Locale));

function normalizeLocale(value: string | undefined | null): Locale | null {
  if (!value) return null;
  if (localeValues.has(value)) return value as Locale;

  const lower = value.toLowerCase();
  const match = Object.values(Locale).find(
    (locale) => locale.toLowerCase() === lower,
  );
  if (match) return match;

  const languageOnly = lower.split("-")[0];
  return (
    Object.values(Locale).find(
      (locale) => locale.toLowerCase().split("-")[0] === languageOnly,
    ) ?? null
  );
}

function localeFromAcceptLanguage(headerValue: string | null): Locale | null {
  if (!headerValue) return null;

  const candidates = headerValue
    .split(",")
    .map((part) => {
      const [rawLocale, rawQuality] = part.trim().split(";q=");
      return {
        locale: normalizeLocale(rawLocale),
        quality: rawQuality ? Number.parseFloat(rawQuality) : 1,
      };
    })
    .filter((candidate) => candidate.locale)
    .sort((a, b) => b.quality - a.quality);

  return candidates[0]?.locale ?? null;
}

export async function getServerI18n() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale =
    normalizeLocale(cookieStore.get("ogma-locale")?.value) ??
    localeFromAcceptLanguage(headerStore.get("accept-language")) ??
    Locale.EN;
  const dict = dictionaries[locale] ?? dictionaries[Locale.EN];

  return {
    activeLocale: locale,
    t(key: string, params: Record<string, unknown> = {}) {
      return pupa(dict[key] ?? dictionaries[Locale.EN][key] ?? key, params);
    },
  };
}
