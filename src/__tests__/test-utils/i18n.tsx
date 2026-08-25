import type { ReactNode } from "react";
import I18nProvider from "@/lib/i18n/provider";
import { Locale } from "@/locales";
import en from "@/locales/en.json";

/** Mirrors the app's root provider for components that translate their UI. */
export function withI18n(children: ReactNode): ReactNode {
  return (
    <I18nProvider locale={Locale.EN} lngDict={en}>
      {children}
    </I18nProvider>
  );
}
