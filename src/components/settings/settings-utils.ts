// Atlas inputs: 16px text on mobile so iOS does not zoom, 14px from sm up.
export const inputClass =
  "block w-full min-h-11 rounded-radius-md bg-input border border-border px-3 py-2 text-base text-text placeholder:text-text-tertiary transition-colors focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none sm:min-h-10 sm:text-sm read-only:bg-subtle read-only:text-text-secondary read-only:focus:border-border read-only:focus:ring-0";

export const selectClass =
  "col-start-1 row-start-1 w-full min-h-11 appearance-none rounded-radius-md bg-input border border-border py-2 pr-8 pl-3 text-base text-text transition-colors focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none sm:min-h-10 sm:text-sm";

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-radius-md px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed sm:min-h-9";

/** Primary action: cobalt in light, ink in dark. */
export const saveBtnClass = `${btnBase} bg-action font-semibold text-on-action hover:bg-action-hover`;

/** Secondary: surface with a hairline. */
export const secondaryBtnClass = `${btnBase} border border-border bg-surface text-text hover:bg-subtle`;

/** Ghost: no chrome until hover. */
export const ghostBtnClass = `${btnBase} text-text-secondary hover:bg-subtle hover:text-text`;

/** Destructive, outlined: used for the first step of a dangerous action. */
export const dangerOutlineBtnClass = `${btnBase} border border-error-500/40 bg-surface text-error-700 hover:bg-error-500/10 dark:text-error-400`;

/** Destructive, solid: the final confirmation. */
export const dangerBtnClass = `${btnBase} bg-error-600 font-semibold text-text-on-primary hover:bg-error-700`;

export const errorTextClass = "text-error-700 dark:text-error-400";
export const successTextClass = "text-success-700 dark:text-success-400";
export const warningTextClass = "text-warning-700 dark:text-warning-400";

const noticeBase = "rounded-radius-md border px-3 py-2 text-sm";
export const successNoticeClass = `${noticeBase} border-success-200 bg-success-50 text-success-800 dark:border-success-500/25 dark:bg-success-500/10 dark:text-success-300`;
export const errorNoticeClass = `${noticeBase} border-error-200 bg-error-50 text-error-800 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-300`;
export const warningNoticeClass = `${noticeBase} border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-500/25 dark:bg-warning-500/10 dark:text-warning-300`;

/** Warning-soft chip for "Unsaved". */
export const unsavedChipClass =
  "inline-flex shrink-0 items-center rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-500/15 dark:text-warning-300";

/** Neutral outlined chip, e.g. "Beta". */
export const neutralChipClass =
  "inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary";

/**
 * API error bodies are optional at the UI boundary. Keep malformed or empty
 * responses from replacing an actionable, translated fallback with a parse error.
 */
export async function readResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error
    ) {
      return body.error;
    }
  } catch {
    // A failed response is still valid even when a proxy strips its JSON body.
  }

  return fallback;
}
