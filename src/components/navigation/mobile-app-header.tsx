"use client";

import { type ReactNode } from "react";
import clsx from "clsx";
import { useNativeAppBridge } from "@/lib/native-app";

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
  const nativeApp = !!useNativeAppBridge();
  return (
    <header
      className={clsx(
        "flex min-h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-4 py-1.5 lg:hidden",
        // the android app already pads below the status bar natively
        !nativeApp && "pt-[max(0.375rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      {leading}
      <div className="min-w-[8ch] flex-1">
        <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-text">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs leading-snug text-text-tertiary">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </header>
  );
}
