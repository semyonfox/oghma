"use client";

// providers wrapper for notes editor with Zustand state management
import { ReactNode, Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import I18nProvider from "@/lib/i18n/provider";
import { useLocaleLoader } from "@/lib/hooks/useLocaleLoader";
import { Locale } from "@/locales";
import dynamic from "next/dynamic";

const TrashModal = dynamic(() => import("@/components/notes/trash-modal"), { ssr: false });
const PreviewModal = dynamic(() => import("@/components/notes/preview-modal"), { ssr: false });
const LinkToolbar = dynamic(() => import("@/components/notes/link-toolbar"), { ssr: false });

interface NotesProvidersProps {
  children: ReactNode;
}

function NotesProvidersContent({ children }: NotesProvidersProps) {
  const [localeData, _isLoading] = useLocaleLoader(Locale.EN);

  const sharedUI = (
    <>
      <TrashModal />
      <PreviewModal />
      <LinkToolbar />
    </>
  );

  if (!localeData) {
    return (
      <I18nProvider locale={Locale.EN} lngDict={{}}>
        {children}
        {sharedUI}
      </I18nProvider>
    );
  }

  return (
    <I18nProvider locale={localeData.locale} lngDict={localeData.dict}>
      {children}
      {sharedUI}
    </I18nProvider>
  );
}

export default function NotesProviders({ children }: NotesProvidersProps) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <I18nProvider locale={Locale.EN} lngDict={{}}>
            {children}
          </I18nProvider>
        }
      >
        <NotesProvidersContent>{children}</NotesProvidersContent>
      </Suspense>
    </ErrorBoundary>
  );
}
