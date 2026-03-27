"use client";

import { FC } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import usePortalStore from "@/lib/notes/state/portal";
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  SparklesIcon,
  Cog6ToothIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline";

interface NavItem {
  id: string;
  labelKey: string;
  icon: FC<{ className?: string }>;
  href: string;
  section: "notes" | "search" | "calendar" | "settings" | "chat" | "quiz";
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "notes",
    labelKey: "Notes",
    icon: DocumentTextIcon,
    href: "/notes",
    section: "notes",
  },
  {
    id: "search",
    labelKey: "Search",
    icon: MagnifyingGlassIcon,
    href: "/notes",
    section: "search",
  },
  {
    id: "calendar",
    labelKey: "Calendar",
    icon: CalendarIcon,
    href: "/calendar",
    section: "calendar",
  },
  {
    id: "chat",
    labelKey: "AI Chat",
    icon: SparklesIcon,
    href: "/chat",
    section: "chat",
  },
  {
    id: "quiz",
    labelKey: "Quiz",
    icon: AcademicCapIcon,
    href: "/quiz",
    section: "quiz",
  },
];

/**
 * Icon-only navigation sidebar (56px fixed width)
 * VSCode-style left navigation with hover tooltips
 */
const IconNav: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { activeNav, setActiveNav } = useLayoutStore();
  const { t } = useI18n();
  const handleNavClick = (item: NavItem) => {
    if (item.section === "search") {
      usePortalStore.getState().search.open();
      return;
    }
    setActiveNav(item.section);
    if (pathname !== item.href) {
      router.push(item.href);
    }
  };

  return (
    <div className="h-full w-12 shrink-0 flex flex-col items-center py-4 gap-2">
      {/* Logo/Branding */}
      <Link
        href="/"
        className="flex items-center justify-center w-10 h-10 mb-4 hover:opacity-70 transition-opacity"
      >
        <img src="/oghmanotes.svg" alt="OghmaNotes Logo" className="w-6 h-6" />
      </Link>

      {/* Navigation Items */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = activeNav === item.section;
          const translatedLabel = t(item.labelKey);

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                relative w-10 h-10 flex items-center justify-center rounded transition-colors
                ${
                  isActive
                    ? "bg-subtle text-text-secondary"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-subtle"
                }
                group
              `}
              title={translatedLabel}
            >
              <IconComp className="w-5 h-5" />

              {/* Hover tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle">
                {translatedLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-border my-2" />

      {/* Settings */}
      <button
        onClick={() =>
          handleNavClick({
            id: "settings",
            labelKey: "Settings",
            icon: Cog6ToothIcon,
            href: "/settings",
            section: "settings",
          })
        }
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors text-text-tertiary hover:text-text-secondary hover:bg-subtle group relative ${
          activeNav === "settings" ? "bg-subtle text-text-secondary" : ""
        }`}
        title={t("Settings")}
      >
        <Cog6ToothIcon className="w-5 h-5" />
        <div className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle">
          {t("Settings")}
        </div>
      </button>
    </div>
  );
};

export default IconNav;
