"use client";

import { useState, type ReactNode } from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import useI18n from "@/lib/notes/hooks/use-i18n";
import MobileDrawer from "./mobile-drawer";
import PrimaryNavigation from "./primary-navigation";

interface MobileAppHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function MobileAppHeader({
  title,
  actions,
  className,
}: MobileAppHeaderProps) {
  const { t } = useI18n();
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <>
      <header
        className={clsx(
          "flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-background px-1.5 md:hidden",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setNavigationOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-radius-md text-text-tertiary transition-colors hover:bg-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
          aria-label={t("Open main menu")}
        >
          <Bars3Icon className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-text-secondary">
          {title}
        </div>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
      </header>

      <MobileDrawer
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        title={t("Main navigation")}
        side="left"
        className="md:hidden"
      >
        <PrimaryNavigation
          variant="drawer"
          onNavigate={() => setNavigationOpen(false)}
        />
      </MobileDrawer>
    </>
  );
}
