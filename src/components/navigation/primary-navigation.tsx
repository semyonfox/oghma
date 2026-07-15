"use client";

import { FC } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useGlobalSearchStore from "@/lib/global-search/state";
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
 * Primary app navigation rail (48px fixed width) with hover tooltips.
 * NOTE: Parent container is responsible for overflow behavior (overflow-hidden).
 * This component should never be scrollable; it fills full height.
 */
const PrimaryNavigation: FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const activeNav = useLayoutStore((state) => state.activeNav);
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);
  const rightPanelOpen = useLayoutStore((state) => state.rightPanelOpen);
  const rightPanelTab = useLayoutStore((state) => state.rightPanelTab);
  const { t } = useI18n();

  const derivedActiveSection: NavItem["section"] | "settings" =
    pathname?.startsWith("/settings")
      ? "settings"
      : pathname?.startsWith("/quiz")
        ? "quiz"
        : pathname?.startsWith("/calendar")
          ? "calendar"
          : pathname?.startsWith("/chat")
            ? "chat"
            : pathname?.startsWith("/notes") && rightPanelOpen && rightPanelTab === "ai"
              ? "chat"
              : pathname?.startsWith("/notes")
                ? "notes"
                : activeNav;
  const handleNavClick = (item: NavItem) => {
    if (item.section === "search") {
      useGlobalSearchStore.getState().open();
      return;
    }

    // Global AI chat entry should always open a fresh full-screen chat.
    if (item.section === "chat") {
      setActiveNav(item.section);
      router.push("/chat");
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
        className="flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] mb-4 hover:opacity-70 transition-opacity"
      >
        <img src="/oghmanotes.svg" alt="OghmaNotes Logo" className="w-6 h-6" />
      </Link>

      {/* Navigation Items */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const IconComp = item.icon;
          const isActive = derivedActiveSection === item.section;
          const translatedLabel = t(item.labelKey);

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              aria-describedby={`tooltip-${item.id}`}
              className={`
                relative w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-radius-md transition-colors
                ${
                  isActive
                    ? "bg-primary-500/10 text-primary-400"
                    : "text-text-tertiary hover:text-text hover:bg-subtle"
                }
                group
              `}
              title={translatedLabel}
            >
              <IconComp className="w-5 h-5" />

              {/* Hover tooltip */}
              <div
                id={`tooltip-${item.id}`}
                role="tooltip"
                className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded-radius-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle"
              >
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
        aria-describedby="tooltip-settings"
        className={`w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-radius-md transition-colors group relative ${
          derivedActiveSection === "settings"
            ? "bg-primary-500/10 text-primary-400"
            : "text-text-tertiary hover:text-text hover:bg-subtle"
        }`}
        title={t("Settings")}
      >
        <Cog6ToothIcon className="w-5 h-5" />
        <div
          id="tooltip-settings"
          role="tooltip"
          className="absolute left-full ml-2 px-2 py-1 bg-surface text-text-secondary text-xs rounded-radius-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity border border-border-subtle"
        >
          {t("Settings")}
        </div>
      </button>
    </div>
  );
};

export default PrimaryNavigation;
