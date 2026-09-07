"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCanvasImportStatus } from "@/hooks/useCanvasImportStatus";

const CanvasImportContext = createContext<ReturnType<
  typeof useCanvasImportStatus
> | null>(null);

export function useCanvasImportNotification() {
  return useContext(CanvasImportContext);
}

// Keep one poller for the workspace, shared by desktop and mobile navigation.
export default function CanvasImportNotifications({
  children,
}: {
  children: ReactNode;
}) {
  const status = useCanvasImportStatus({ autoCheckOnMount: true });
  return (
    <CanvasImportContext.Provider value={status}>
      {children}
    </CanvasImportContext.Provider>
  );
}
