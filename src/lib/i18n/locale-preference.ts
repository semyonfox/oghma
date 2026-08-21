"use client";

import { LOCALE_COOKIE_NAME, normalizeLocale, type Locale } from "@/locales";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * The cookie is the only browser-side copy of the language. The server renders
 * from the same value, so any second client-side store could only ever
 * disagree with the markup the page was built from.
 */
export function persistClientLocale(locale: string): void {
  if (typeof document === "undefined") return;

  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
  } catch {
    // Browsers can deny storage in private or constrained contexts. The
    // in-memory provider state still keeps this visit consistent.
  }
}

export function readClientLocale(): Locale | null {
  if (typeof document === "undefined") return null;

  try {
    const rawLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_COOKIE_NAME}=`))
      ?.split("=")[1];

    return rawLocale ? normalizeLocale(decodeURIComponent(rawLocale)) : null;
  } catch {
    return null;
  }
}
