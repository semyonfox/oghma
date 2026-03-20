import { useEffect, useState } from 'react';
import { Locale } from '@/locales';
import { DEFAULT_SETTINGS } from '@/lib/notes/types/settings';

interface LocaleData {
  locale: Locale;
  dict: Record<string, string>;
}

/**
 * Hook to load user's locale preference from settings
 * Falls back to English if no preference is set
 */
export function useLocaleLoader(initialLocale: Locale = Locale.EN): [LocaleData | null, boolean] {
  const [localeData, setLocaleData] = useState<LocaleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserLocale = async () => {
      try {
        // Try to fetch user's saved locale preference
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          const userLocale = settings.locale || DEFAULT_SETTINGS.locale || Locale.EN;
          const module = await import(`@/locales/${userLocale}.json`);
          setLocaleData({
            locale: userLocale,
            dict: module.default,
          });
        } else {
          // Fall back to default/initial locale
          const module = await import(`@/locales/${initialLocale}.json`);
          setLocaleData({
            locale: initialLocale,
            dict: module.default,
          });
        }
      } catch (error) {
        // If anything fails, fall back to initial locale
        console.warn('Failed to load user locale, using default', error);
        try {
          const module = await import(`@/locales/${initialLocale}.json`);
          setLocaleData({
            locale: initialLocale,
            dict: module.default,
          });
        } catch (fallbackError) {
          console.error('Failed to load even fallback locale', fallbackError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUserLocale();
  }, [initialLocale]);

  return [localeData, isLoading];
}
