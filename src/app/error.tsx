"use client";

import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

import useI18n from "@/lib/notes/hooks/use-i18n";

// segment error boundary for everything below the root layout. errors thrown
// by the root layout itself need a global-error.tsx, which does not exist yet
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    captureException(error);
  }, [error]);

  // client-side messages are raw exception text, so they go to Sentry instead of the page
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[50vh] p-8 bg-app-page"
    >
      <h2 className="font-serif text-2xl font-semibold mb-2">
        {t("error.something_went_wrong")}
      </h2>
      <p className="text-sm text-text-tertiary mb-4">
        {t("Something unexpected happened. Please try again.")}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm bg-primary-600 text-text-on-primary rounded-radius-md hover:bg-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
      >
        {t("error.try_again")}
      </button>
    </div>
  );
}
