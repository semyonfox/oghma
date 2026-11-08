import type { FC } from "react";
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  SparklesIcon,
  Cog6ToothIcon,
  AcademicCapIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";

export interface NavItem {
  id: string;
  labelKey: string;
  icon: FC<{ className?: string }>;
  href: string;
  section: "notes" | "search" | "calendar" | "settings" | "chat" | "quiz" | "study-map";
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "notes",
    labelKey: "Notes",
    icon: DocumentTextIcon,
    href: "/notes",
    section: "notes",
  },
  { id: "study-map", labelKey: "Study map", icon: Square3Stack3DIcon, href: "/study-map", section: "study-map" },
  {
    id: "search",
    labelKey: "Search OghmaNotes",
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
    labelKey: "quiz.title",
    icon: AcademicCapIcon,
    href: "/quiz",
    section: "quiz",
  },
];

export const SETTINGS_ITEM: NavItem = {
  id: "settings",
  labelKey: "Settings",
  icon: Cog6ToothIcon,
  href: "/settings",
  section: "settings",
};
