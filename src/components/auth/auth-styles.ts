// Shared Atlas classes for the sign-in, sign-up and account-recovery pages.

/** Page ground: plain background, editorial single column. */
export const authPageClass =
  "flex min-h-dvh flex-col justify-center bg-background px-6 py-12 sm:px-8";

export const authColumnClass = "mx-auto w-full max-w-[420px]";

/** Literata page title. */
export const authTitleClass =
  "font-serif text-3xl font-semibold tracking-tight text-text sm:text-4xl";

export const authLabelClass = "block text-sm/6 font-medium text-text";

/** 16px text on mobile so iOS does not zoom; accent focus ring. */
export const authInputClass =
  "block w-full min-h-11 rounded-radius-md border border-border bg-input px-3.5 py-2.5 text-base text-text placeholder:text-text-tertiary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm";

export const authCheckboxClass =
  "size-4 rounded-radius-sm border border-border-strong bg-input accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const buttonBase =
  "flex min-h-11 w-full items-center justify-center gap-3 rounded-radius-md px-3 py-2.5 text-sm/6 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed";

/** Primary submit: cobalt in light, ink in dark. */
export const authPrimaryButtonClass = `${buttonBase} bg-action text-on-action hover:bg-action-hover disabled:opacity-60`;

/** Google, GitHub and other secondary actions. */
export const authSecondaryButtonClass = `${buttonBase} border border-border bg-surface text-text hover:bg-subtle disabled:opacity-50`;

export const authLinkClass =
  "font-semibold text-accent underline underline-offset-2 hover:text-accent-hover";

export const authErrorTextClass = "text-error-700 dark:text-error-300";
export const authSuccessTextClass = "text-success-700 dark:text-success-400";
