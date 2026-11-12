import type { ReactNode } from "react";
import { cn } from "./settings-utils";

type SettingsCardProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Inline next to the title, e.g. a "Beta" chip. */
  titleAddon?: ReactNode;
  /** Right side of the header row, e.g. the Unsaved chip or a header action. */
  aside?: ReactNode;
  tone?: "default" | "danger";
  children?: ReactNode;
  className?: string;
};

/**
 * Atlas settings section: a hairline card with a header row (title plus a
 * tertiary description) and a body. Keeps the section id for in-page nav.
 */
export function SettingsCard({
  id,
  title,
  description,
  titleAddon,
  aside,
  tone = "default",
  children,
  className,
}: SettingsCardProps) {
  const danger = tone === "danger";
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-radius-xl border bg-surface",
        danger ? "border-error-500/35" : "border-border",
        className,
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6",
          children ? "border-b border-border-subtle" : "",
        )}
      >
        <div className="min-w-0 flex-1 basis-52">
          <h2
            className={cn(
              "flex flex-wrap items-center gap-2 text-base/6 font-semibold",
              danger ? "text-error-700 dark:text-error-400" : "text-text",
            )}
          >
            {title}
            {titleAddon}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-text-tertiary">{description}</p>
          )}
        </div>
        {aside && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {aside}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

export function SettingsCardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-4 py-5 sm:px-6", className)}>{children}</div>;
}

/** Footer row for Save/Cancel; buttons share the width on mobile. */
export function SettingsCardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-border-subtle bg-subtle px-4 py-3 *:flex-1 sm:justify-end sm:px-6 sm:*:flex-none">
      {children}
    </div>
  );
}
