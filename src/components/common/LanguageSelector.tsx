'use client';

import { useState } from 'react';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { Locale, configLocale } from '@/locales';
import { useSettingsStore } from '@/lib/notes/state/ui/settings';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  showLabel?: boolean;
  onLanguageChange?: (locale: Locale) => void;
  className?: string;
}

// Flag emoji mapping for each locale
const localeFlags: Record<Locale, string> = {
  [Locale.EN]: '🇬🇧',
  [Locale.GA]: '🇮🇪',
  [Locale.HI]: '🇮🇳',
  [Locale.ZH_CN]: '🇨🇳',
  [Locale.FR_FR]: '🇫🇷',
  [Locale.ES_ES]: '🇪🇸',
  [Locale.IT_IT]: '🇮🇹',
  [Locale.de_DE]: '🇩🇪',
  [Locale.ru_RU]: '🇷🇺',
  [Locale.ar]: '🇸🇦',
  [Locale.nl_NL]: '🇳🇱',
  [Locale.sv_SE]: '🇸🇪',
};

export default function LanguageSelector({
  variant = 'default',
  showLabel = true,
  onLanguageChange,
  className = '',
}: LanguageSelectorProps) {
  const { t, locale, activeLocale } = useI18n();
  const { updateSettings } = useSettingsStore();
  const [query, setQuery] = useState('');
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(activeLocale as Locale);

  const languages = Object.entries(configLocale).map(([code, name]) => ({
    code: code as Locale,
    name,
    flag: localeFlags[code as Locale],
  }));

  const filteredLanguages =
    query === ''
      ? languages
      : languages.filter((lang) =>
          lang.name.toLowerCase().includes(query.toLowerCase()) ||
          lang.code.toLowerCase().includes(query.toLowerCase())
        );

  const handleLanguageChange = async (lang: Locale) => {
    try {
      // Load the new locale file
      const module = await import(`@/locales/${lang}.json`);
      locale(lang, module.default);

      // Persist the language preference to user settings
      await updateSettings({ locale: lang });

      // Update local state
      setSelectedLocale(lang);
      setQuery('');

      // Call custom callback if provided
      onLanguageChange?.(lang);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  const currentLanguage = languages.find((lang) => lang.code === selectedLocale);

  if (variant === 'compact') {
    // For compact variant, use a regular select (backward compatible)
    return (
      <div className={className}>
        {showLabel && (
          <label className="block text-sm/6 font-medium text-white mb-2">
            {t('Language')}
          </label>
        )}
        <select
          value={selectedLocale || activeLocale}
          onChange={(e) => handleLanguageChange(e.target.value as Locale)}
          className="block w-full rounded-md bg-white/5 py-1.5 px-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 appearance-none"
          style={{
            colorScheme: 'dark'
          }}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Default variant - use Combobox with flag icons
  return (
    <div className={className}>
      {showLabel && (
        <Label className="block text-sm/6 font-medium text-white mb-2">
          {t('Language')}
        </Label>
      )}
      <Combobox
        as="div"
        value={selectedLocale}
        onChange={(nextLocale) => {
          if (nextLocale) {
            handleLanguageChange(nextLocale);
          }
        }}
      >
        <div className="relative">
          <ComboboxInput
            className="block w-full rounded-md bg-white/5 py-1.5 pr-12 pl-3 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => setQuery('')}
            displayValue={(code) =>
              currentLanguage
                ? `${currentLanguage.flag} ${currentLanguage.name}`
                : t('Language')
            }
            placeholder={t('Search languages...')}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-hidden">
            <ChevronDownIcon className="size-5 text-gray-400" aria-hidden="true" />
          </ComboboxButton>

          <ComboboxOptions
            transition
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base outline -outline-offset-1 outline-white/10 data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm"
          >
            {filteredLanguages.length === 0 && query.length > 0 ? (
              <div className="cursor-default px-3 py-2 text-gray-400">
                {t('No languages found')}
              </div>
            ) : (
              filteredLanguages.map((lang) => (
                <ComboboxOption
                  key={lang.code}
                  value={lang.code}
                  className="cursor-default px-3 py-2 text-white select-none data-focus:bg-indigo-500 data-focus:outline-hidden"
                >
                  <div className="flex items-center">
                    <span className="text-xl mr-3">{lang.flag}</span>
                    <div>
                      <span className="block truncate font-medium">{lang.name}</span>
                      <span className="text-xs text-gray-400">{lang.code}</span>
                    </div>
                  </div>
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}
