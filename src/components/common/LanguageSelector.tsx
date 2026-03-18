'use client';

import { ChangeEvent } from 'react';
import useI18n from '@/lib/notes/hooks/use-i18n';
import { Locale, configLocale } from '@/locales';
import { useSettingsStore } from '@/lib/notes/state/ui/settings';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  showLabel?: boolean;
  onLanguageChange?: (locale: Locale) => void;
  className?: string;
}

export default function LanguageSelector({
  variant = 'default',
  showLabel = true,
  onLanguageChange,
  className = '',
}: LanguageSelectorProps) {
  const { t, locale, activeLocale } = useI18n();
  const { updateSettings } = useSettingsStore();

  const handleLanguageChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value as Locale;
    try {
      // Load the new locale file
      const module = await import(`@/locales/${nextLocale}.json`);
      locale(nextLocale, module.default);

      // Persist the language preference to user settings
      await updateSettings({ locale: nextLocale });

      // Call custom callback if provided
      onLanguageChange?.(nextLocale);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  const selectClasses = {
    default: 'bg-white/5 border border-white/10 text-gray-300 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5',
    compact: 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2',
  };

  return (
    <div className={className}>
      {showLabel && (
        <label
          htmlFor="language-select"
          className={variant === 'default'
            ? 'text-xs font-semibold text-gray-400 uppercase tracking-tighter block mb-2'
            : 'block text-sm font-medium text-gray-700 mb-1'
          }
        >
          {t('Language')}
        </label>
      )}
      <select
        id="language-select"
        value={activeLocale}
        onChange={handleLanguageChange}
        className={selectClasses[variant]}
      >
        {Object.entries(configLocale).map(([code, name]) => (
          <option
            key={code}
            value={code}
            className={variant === 'default' ? 'bg-gray-900' : 'bg-white'}
          >
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
