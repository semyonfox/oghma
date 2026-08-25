import "server-only";

import { cookies, headers } from "next/headers";
import pupa from "pupa";
import {
  LOCALE_COOKIE_NAME,
  Locale,
  localeFromAcceptLanguage,
  normalizeLocale,
} from "@/locales";
import { baseLocaleDictionary, loadLocaleData } from "./locale-data";

/** Resolve the request locale once for server-rendered content and document metadata. */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (cookieLocale) return cookieLocale;

  const headerStore = await headers();
  return localeFromAcceptLanguage(headerStore.get("accept-language")) ?? Locale.EN;
}

export async function getServerI18n() {
  const locale = await getRequestLocale();
  const { dict } = await loadLocaleData(locale);

  return {
    activeLocale: locale,
    t(key: string, params: Record<string, unknown> = {}) {
      return pupa(dict[key] ?? baseLocaleDictionary[key] ?? key, params);
    },
  };
}
