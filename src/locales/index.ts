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
