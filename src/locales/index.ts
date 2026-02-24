// adapted from notea: https://github.com/QingWei-Li/notea
// original file: locales/index.ts

// locale enum for oghma
// can be extended as more translations are added
export enum Locale {
  ZH_CN = 'zh-CN',
  EN = 'en',
  de_DE = 'de-DE',
  ru_RU = 'ru-RU',
  ar = 'ar',
  it_IT = 'it-IT',
  nl_NL = 'nl-NL',
  fr_FR = 'fr-FR',
  sv_SE = 'sv-SE',
}

// locale display names for settings UI
export const configLocale: Record<Locale, string> = {
  [Locale.EN]: 'English',
  [Locale.ZH_CN]: '简体中文',
  [Locale.de_DE]: 'Deutsch',
  [Locale.ru_RU]: 'Русский',
  [Locale.ar]: 'العربية',
  [Locale.it_IT]: 'Italiano',
  [Locale.nl_NL]: 'Nederlands',
  [Locale.fr_FR]: 'français',
  [Locale.sv_SE]: 'Svenska',
};
