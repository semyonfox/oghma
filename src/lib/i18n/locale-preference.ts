"use client";

import { uiCache } from "@/lib/notes/cache";

export const LOCALE_STORAGE_KEY = "ogma-locale";
export const SETTINGS_CACHE_KEY = "settings-cache";

export interface CachedLocalePreference {
  locale: string;
  cachedAt: number;
}

export async function persistClientLocale(locale: string): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_STORAGE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Browsers can deny storage in private or constrained contexts. The in-memory
    // provider state still keeps this visit consistent.
  }

  try {
    await uiCache.setItem<CachedLocalePreference>(SETTINGS_CACHE_KEY, {
      locale,
      cachedAt: Date.now(),
    });
  } catch {
    // IndexedDB is an optimization only; do not fail a locale change for it.
  }
}
