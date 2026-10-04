"use client";

import { useEffect } from "react";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileBottomNavigation from "@/components/navigation/mobile-bottom-navigation";
import StudyWorkspace from "@/components/study-map/study-workspace";
import useLayoutStore from "@/lib/notes/state/layout.zustand";
import type { StudyMapSummary } from "@/lib/study-map/types";

export default function StudyMapPageClient(props: { initialMaps: StudyMapSummary[]; initialMapId: string | null; initialNoteId: string | null }) {
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);
  useEffect(() => { setActiveNav("study-map"); }, [setActiveNav]);
  return <div className="flex h-dvh flex-col bg-app-page text-text">
    <MobileAppHeader title="Study map" />
    <div className="flex min-h-0 flex-1">
      <div className="desktop-navigation-rail hidden w-14 shrink-0 border-r border-border-subtle bg-background lg:block"><PrimaryNavigation /></div>
      <div className="mobile-dock-clearance min-w-0 flex-1 overflow-y-auto"><StudyWorkspace {...props} /></div>
    </div>
    <MobileBottomNavigation />
  </div>;
}
