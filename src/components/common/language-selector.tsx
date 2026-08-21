"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { Locale, configLocale, normalizeLocale, supportedLocales } from "@/locales";
import {
  SettingsRequestError,
  useSettingsStore,
} from "@/lib/notes/state/ui/settings";
import { loadLocaleData } from "@/lib/i18n/locale-data";

interface LanguageSelectorProps {
  variant?: "default" | "compact" | "footer";
  showLabel?: boolean;
  /**
   * Controlled value. Pass it with `onSelect` when a section's own Save button
   * owns the change; leave both unset to apply and persist on selection.
   */
  value?: Locale;
  onSelect?: (locale: Locale) => void;
  className?: string;
}

// Flag emoji mapping for each locale
const localeFlags: Record<Locale, string> = {
  [Locale.EN]: "🇬🇧",
  [Locale.GA]: "🇮🇪",
  [Locale.HI]: "🇮🇳",
  [Locale.ZH_CN]: "🇨🇳",
  [Locale.FR_FR]: "🇫🇷",
  [Locale.ES_ES]: "🇪🇸",
  [Locale.IT_IT]: "🇮🇹",
  [Locale.de_DE]: "🇩🇪",
  [Locale.ru_RU]: "🇷🇺",
  [Locale.ar]: "🇸🇦",
  [Locale.nl_NL]: "🇳🇱",
  [Locale.sv_SE]: "🇸🇪",
};

const selectClass: Record<"compact" | "footer", string> = {
  compact:
    "block w-full rounded-radius-md bg-surface border border-border-subtle py-1.5 px-3 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none appearance-none disabled:opacity-50",
  footer:
    "bg-input border border-border-subtle text-text-secondary text-sm rounded-radius-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 appearance-none disabled:opacity-50",
};

const labelClass: Record<"compact" | "footer", string> = {
  compact: "block text-sm/6 font-medium text-text mb-2",
  footer:
    "text-xs font-semibold text-text-tertiary uppercase tracking-tighter block mb-1.5",
};

export default function LanguageSelector({
  variant = "default",
  showLabel = true,
  value,
  onSelect,
  className = "",
}: LanguageSelectorProps) {
  const { t, locale, activeLocale } = useI18n();
  const router = useRouter();
  const { updateSettings } = useSettingsStore();
  const [query, setQuery] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const selectId = useId();

  // Deferred mode only reports the selection; the parent form persists it.
  const isDeferred = typeof onSelect === "function";
  const selectedLocale = value ?? activeLocale;

  const languages = supportedLocales.map((code) => ({
    code,
    name: configLocale[code],
    flag: localeFlags[code],
  }));

  const filteredLanguages =
    query === ""
      ? languages
      : languages.filter(
          (lang) =>
            lang.name.toLowerCase().includes(query.toLowerCase()) ||
            lang.code.toLowerCase().includes(query.toLowerCase()),
        );

  const applyImmediately = async (lang: Locale) => {
    setIsApplying(true);
    try {
      const { dict } = await loadLocaleData(lang);
      // Apply first so the provider mirrors the choice into the cookie and
      // local storage. The language then holds even when the account save is
      // unavailable, which is the normal case for signed-out visitors.
      locale(lang, dict);

      try {
        await updateSettings({ locale: lang });
      } catch (error) {
        // A signed-out visitor has no account to save to; the local
        // preference is the whole story and nothing has gone wrong.
        if (
          !(error instanceof SettingsRequestError) ||
          error.status !== 401
        ) {
          console.error("Failed to save language preference:", error);
          toast.error(t("Failed to save language preference"));
        }
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to change language:", error);
      toast.error(t("Failed to change language"));
    } finally {
      setIsApplying(false);
    }
  };

  const handleLanguageChange = (lang: Locale) => {
    setQuery("");
    if (isDeferred) {
      onSelect?.(lang);
      return;
    }
    if (isApplying) return;
    void applyImmediately(lang);
  };

  const currentLanguage = languages.find(
    (lang) => lang.code === selectedLocale,
  );

  if (variant === "compact" || variant === "footer") {
    return (
      <div className={className}>
        {showLabel && (
          <label htmlFor={selectId} className={labelClass[variant]}>
            {t("Language")}
          </label>
        )}
        <select
          id={selectId}
          value={selectedLocale}
          disabled={isApplying}
          onChange={(event) => {
            const nextLocale = normalizeLocale(event.currentTarget.value);
            if (nextLocale) handleLanguageChange(nextLocale);
          }}
          className={selectClass[variant]}
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
        <Label className="block text-sm/6 font-medium text-text mb-2">
          {t("Language")}
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
            className="block w-full rounded-radius-md bg-surface border border-border-subtle py-1.5 pr-12 pl-3 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => setQuery("")}
            displayValue={(_code) =>
              currentLanguage
                ? `${currentLanguage.flag} ${currentLanguage.name}`
                : t("Language")
            }
            placeholder={t("Search languages...")}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-hidden">
            <ChevronDownIcon
              className="size-5 text-text-tertiary"
              aria-hidden="true"
            />
          </ComboboxButton>

          <ComboboxOptions
            transition
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto glass-card rounded-radius-lg py-1 text-sm data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0"
          >
            {filteredLanguages.length === 0 && query.length > 0 ? (
              <div className="cursor-default px-3 py-2 text-text-tertiary">
                {t("No languages found")}
              </div>
            ) : (
              filteredLanguages.map((lang) => (
                <ComboboxOption
                  key={lang.code}
                  value={lang.code}
                  className="cursor-default px-3 py-2 text-text select-none data-focus:bg-primary-600 data-focus:text-text-on-primary data-focus:outline-hidden"
                >
                  <div className="flex items-center">
                    <span className="text-xl mr-3">{lang.flag}</span>
                    <div>
                      <span className="block truncate font-medium">
                        {lang.name}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {lang.code}
                      </span>
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
