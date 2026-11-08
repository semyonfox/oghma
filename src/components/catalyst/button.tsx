import * as Headless from "@headlessui/react";
import clsx from "clsx";
import React from "react";
import { Link } from "./link";

// Atlas variants: `color` picks a solid role, `outline` is the secondary
// button and `plain` is the ghost button. Colours come from tokens only.
const styles = {
  base: [
    // Base
    "relative isolate inline-flex min-h-11 items-center justify-center gap-x-2 rounded-radius-md border text-base/6 font-medium transition-colors sm:min-h-9",
    // Sizing
    "px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6",
    // Focus
    "focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-accent",
    // Disabled
    "data-disabled:cursor-not-allowed data-disabled:opacity-50",
    // Icon
    "*:data-[slot=icon]:-mx-0.5 *:data-[slot=icon]:my-0.5 *:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:self-center *:data-[slot=icon]:text-(--btn-icon) sm:*:data-[slot=icon]:my-1 sm:*:data-[slot=icon]:size-4 forced-colors:[--btn-icon:ButtonText] forced-colors:data-hover:[--btn-icon:ButtonText]",
  ],
  // secondary: surface with a hairline
  outline: [
    "border-border bg-surface text-text data-active:bg-subtle data-hover:bg-subtle",
    "[--btn-icon:var(--color-text-tertiary)] data-active:[--btn-icon:var(--color-text-secondary)] data-hover:[--btn-icon:var(--color-text-secondary)]",
  ],
  // ghost: no chrome until hover
  plain: [
    "border-transparent text-text data-active:bg-subtle data-hover:bg-subtle",
    "[--btn-icon:var(--color-text-tertiary)] data-active:[--btn-icon:var(--color-text-secondary)] data-hover:[--btn-icon:var(--color-text-secondary)]",
  ],
  colors: {
    // primary action: cobalt in light, ink in dark
    action: [
      "border-transparent bg-action font-semibold text-on-action data-active:bg-action-hover data-hover:bg-action-hover",
      "[--btn-icon:currentColor]",
    ],
    secondary: [
      "border-border bg-surface text-text data-active:bg-subtle data-hover:bg-subtle",
      "[--btn-icon:var(--color-text-tertiary)] data-active:[--btn-icon:var(--color-text-secondary)] data-hover:[--btn-icon:var(--color-text-secondary)]",
    ],
    danger: [
      "border-transparent bg-error-600 font-semibold text-text-on-primary data-active:bg-error-700 data-hover:bg-error-700",
      "[--btn-icon:currentColor]",
    ],
  },
};

type ButtonProps = (
  | { color?: keyof typeof styles.colors; outline?: never; plain?: never }
  | { color?: never; outline: true; plain?: never }
  | { color?: never; outline?: never; plain: true }
) & { className?: string; children: React.ReactNode } & (
    | ({ href?: never } & Omit<Headless.ButtonProps, "as" | "className">)
    | ({ href: string } & Omit<
        React.ComponentPropsWithoutRef<typeof Link>,
        "className"
      >)
  );

export function Button({
  color,
  outline,
  plain,
  className,
  children,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLElement> }) {
  let classes = clsx(
    className,
    styles.base,
    outline
      ? styles.outline
      : plain
        ? styles.plain
        : styles.colors[color ?? "action"],
  );

  return typeof props.href === "string" ? (
    <Link
      {...props}
      className={classes}
      ref={ref as React.Ref<HTMLAnchorElement>}
    >
      <TouchTarget>{children}</TouchTarget>
    </Link>
  ) : (
    <Headless.Button
      {...props}
      className={clsx(classes, "cursor-default")}
      ref={ref}
    >
      <TouchTarget>{children}</TouchTarget>
    </Headless.Button>
  );
}

/**
 * Expand the hit area to at least 44×44px on touch devices
 */
function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
      {children}
    </>
  );
}
