"use client";

import Image from "next/image";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { configLocale } from "@/locales";

export default function Footer() {
  const { t, locale, activeLocale } = useI18n();

  const navigation = {
    features: [
      { name: t("RAG Chat"), href: "/#features" },
      { name: t("Adaptive Quizzes"), href: "/#features" },
      { name: t("Spaced Repetition"), href: "/#features" },
      { name: t("Canvas Integration"), href: "/#features" },
    ],
    support: [
      { name: t("Documentation"), href: "/syntax-guide" },
      { name: t("Guides"), href: "/syntax-guide" },
      { name: t("Contact"), href: "/#contact" },
    ],
    company: [
      { name: t("About"), href: "/about" },
      { name: t("Blog"), href: "/blog" },
      { name: t("GitHub"), href: "https://github.com/semyonfox/oghma" },
    ],
    legal: [
      { name: t("Privacy Policy"), href: "#" },
      { name: t("Terms of Service"), href: "#" },
      { name: t("License"), href: "#" },
    ],
    social: [
      {
        name: t("GitHub"),
        href: "https://github.com/semyonfox/oghma",
        icon: (props) => (
          <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
    ],
  };

  const handleLanguageChange = async (e) => {
    const nextLocale = e.target.value;
    try {
      // Load the new locale file
      const module = await import(`@/locales/${nextLocale}.json`);
      locale(nextLocale, module.default);

      // Persist the language preference to user settings
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
    } catch (error) {
      console.error("Failed to change language:", error);
    }
  };

  return (
    <footer className="bg-background border-t border-border-subtle">
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <div className="font-serif text-2xl font-bold text-white flex items-center gap-2">
              <Image
                src="/oghmanotes.svg"
                alt="OghmaNotes Logo"
                width={32}
                height={32}
              />
              {t("OghmaNotes")}
            </div>
            <p className="text-sm/6 text-balance text-text-tertiary">
              {t(
                "RAG-powered learning platform combining semantic notes, adaptive quizzes, and spaced-repetition flashcards. Built for students who want to study smarter.",
              )}
            </p>
            <div className="flex gap-x-6">
              {navigation.social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-tertiary hover:text-text-secondary"
                >
                  <span className="sr-only">{item.name}</span>
                  <item.icon aria-hidden="true" className="size-6" />
                </a>
              ))}
            </div>
            {/* Language Switcher */}
            <div className="pt-4">
              <label
                htmlFor="language-select"
                className="text-xs font-semibold text-text-tertiary uppercase tracking-tighter block mb-2"
              >
                {t("Language")}
              </label>
              <select
                id="language-select"
                value={activeLocale}
                onChange={handleLanguageChange}
                className="bg-white/5 border border-white/10 text-text-secondary text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 appearance-none"
                style={{
                  colorScheme: "dark",
                }}
              >
                {Object.entries(configLocale).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm/6 font-semibold text-white">
                  {t("Features")}
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.features.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-text-tertiary hover:text-text-secondary"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm/6 font-semibold text-white">
                  {t("Support")}
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.support.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-text-tertiary hover:text-text-secondary"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm/6 font-semibold text-white">
                  {t("Company")}
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.company.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-text-tertiary hover:text-text-secondary"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm/6 font-semibold text-white">
                  {t("Legal")}
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.legal.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="text-sm/6 text-text-tertiary hover:text-text-secondary"
                      >
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-16 border-t border-border-subtle pt-8 sm:mt-20 lg:mt-24">
          <p className="text-xs/5 text-text-tertiary">
            {t("© {year} OghmaNotes. All rights reserved.", {
              year: new Date().getFullYear(),
            })}
          </p>
        </div>
      </div>
    </footer>
  );
}
