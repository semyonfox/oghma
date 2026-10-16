import "server-only";

import { cookies, headers } from "next/headers";
import {
  LOCALE_COOKIE_NAME,
  Locale,
  localeFromAcceptLanguage,
  normalizeLocale,
} from "@/locales";
import { loadLocaleData } from "./locale-data";
import { translate, type Translate } from "./translate";

/** Resolve the request locale once for server-rendered content and document metadata. */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (cookieLocale) return cookieLocale;

  const headerStore = await headers();
  return localeFromAcceptLanguage(headerStore.get("accept-language")) ?? Locale.EN;
}

export async function getServerI18n(): Promise<{
  activeLocale: Locale;
  t: Translate;
}> {
  const locale = await getRequestLocale();
  const { dict } = await loadLocaleData(locale);

  return {
    activeLocale: locale,
    t: (key, params) => translate(dict, key, params),
  };
}
