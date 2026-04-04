"use client";

import useI18n from "@/lib/notes/hooks/use-i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <h2 className="text-lg font-semibold mb-2">
        {t("error.something_went_wrong")}
      </h2>
      <p className="text-sm text-text-tertiary mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-500 transition-colors"
      >
        {t("error.try_again")}
      </button>
    </div>
  );
}
