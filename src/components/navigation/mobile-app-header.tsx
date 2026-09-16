"use client";

import { type ReactNode } from "react";
import clsx from "clsx";

interface MobileAppHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function MobileAppHeader({
  title,
  subtitle,
  leading,
  actions,
  className,
}: MobileAppHeaderProps) {
  return (
    <header
      className={clsx(
        "flex min-h-20 shrink-0 items-center gap-3 bg-background px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-text">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-text-tertiary">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </header>
  );
}
