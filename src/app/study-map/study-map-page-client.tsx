"use client";

import { useEffect } from "react";
import PrimaryNavigation from "@/components/navigation/primary-navigation";
import MobileAppHeader from "@/components/navigation/mobile-app-header";
import MobileBottomNavigation from "@/components/navigation/mobile-bottom-navigation";
import StudyWorkspace from "@/components/study-map/study-workspace";
import { ChromeFrame, StudyMapSkeleton } from "@/components/study-map/study-chrome";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useLayoutStore from "@/lib/notes/state/layout";
import type { StudyMapSummary } from "@/lib/study-map/types";

export default function StudyMapPageClient(props: {
  initialMaps: StudyMapSummary[] | null;
  initialMapId: string | null;
  initialNoteId: string | null;
}) {
  const { t } = useI18n();
  const { initialMaps, initialMapId, initialNoteId } = props;
  const setActiveNav = useLayoutStore((state) => state.setActiveNav);
  useEffect(() => {
    setActiveNav("study-map");
  }, [setActiveNav]);
  return (
    <div className="flex h-app flex-col bg-app-page text-text">
      <MobileAppHeader title={t("Study map")} />
      <div className="flex min-h-0 flex-1">
        <div className="desktop-navigation-rail hidden w-64 shrink-0 border-r border-border lg:block">
          <PrimaryNavigation variant="sidebar" />
        </div>
        {/* the canvas fills this column and stops above the mobile dock */}
        <div className="mobile-dock-clearance flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1">
            {initialMaps ? (
              <StudyWorkspace initialMaps={initialMaps} initialMapId={initialMapId} initialNoteId={initialNoteId} />
            ) : (
              <ChromeFrame>
                <StudyMapSkeleton />
              </ChromeFrame>
            )}
          </div>
        </div>
      </div>
      <MobileBottomNavigation />
    </div>
  );
}
