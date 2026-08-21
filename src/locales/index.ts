// adapted from notea: https://github.com/QingWei-Li/notea
// original file: locales/index.ts

// locale enum for oghma
// can be extended as more translations are added
export enum Locale {
  EN = 'en',
  GA = 'ga',
  HI = 'hi',
  ZH_CN = 'zh-CN',
  FR_FR = 'fr-FR',
  ES_ES = 'es-ES',
  IT_IT = 'it-IT',
  de_DE = 'de-DE',
  ru_RU = 'ru-RU',
  ar = 'ar',
  nl_NL = 'nl-NL',
  sv_SE = 'sv-SE',
}

export const supportedLocales = Object.values(Locale) as Locale[];

/** The browser-side copy of the language preference, read by server renders. */
export const LOCALE_COOKIE_NAME = 'ogma-locale';

/**
 * Match a persisted/browser locale to a supported application locale. Exact
 * matches are preferred; language-only browser preferences fall back to the
 * corresponding supported regional locale.
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  const exact = supportedLocales.find(
    (locale) => locale.toLowerCase() === normalized,
  );
  if (exact) return exact;

  const language = normalized.split('-', 1)[0];
  return (
    supportedLocales.find(
      (locale) => locale.toLowerCase().split('-', 1)[0] === language,
    ) ?? null
  );
}

/** Select the most preferred supported locale from a standard HTTP header. */
export function localeFromAcceptLanguage(
  headerValue: string | null,
): Locale | null {
  if (!headerValue) return null;

  const candidates = headerValue.split(",").flatMap((part, position) => {
    const [rawLocale, ...parameters] = part.trim().split(";");
    const locale = normalizeLocale(rawLocale);
    const qualityValue = parameters
      .map((parameter) => parameter.trim().match(/^q\s*=\s*(.+)$/i)?.[1])
      .find((value) => value !== undefined);
    const quality = qualityValue === undefined ? 1 : Number(qualityValue);
    const isAccepted =
      Number.isFinite(quality) && quality > 0 && quality <= 1;
    return locale && isAccepted ? [{ locale, quality, position }] : [];
  });

  candidates.sort((a, b) => b.quality - a.quality || a.position - b.position);
  return candidates[0]?.locale ?? null;
}

// locale display names for settings UI
export const configLocale: Record<Locale, string> = {
  [Locale.EN]: 'English',
  [Locale.GA]: 'Gaeilge',
  [Locale.HI]: 'हिन्दी',
  [Locale.ZH_CN]: '简体中文',
  [Locale.FR_FR]: 'Français',
  [Locale.ES_ES]: 'Español',
  [Locale.IT_IT]: 'Italiano',
  [Locale.de_DE]: 'Deutsch',
  [Locale.ru_RU]: 'Русский',
  [Locale.ar]: 'العربية',
  [Locale.nl_NL]: 'Nederlands',
  [Locale.sv_SE]: 'Svenska',
};
