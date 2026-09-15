"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useCanvasImportStatus } from "@/hooks/useCanvasImportStatus";
import { useWorkspaceSession } from "@/components/providers/workspace-lifecycle-provider";
import useNoteTreeStore from "@/lib/notes/state/tree";

const CanvasImportContext = createContext<ReturnType<
  typeof useCanvasImportStatus
> | null>(null);

export function useCanvasImportNotification() {
  return useContext(CanvasImportContext);
}

export function useCanvasImportOwner() {
  const owner = useCanvasImportNotification();
  if (!owner) {
    throw new Error("CanvasImportNotifications must wrap Canvas import UI");
  }
  return owner;
}

// Keep one owner across workspace navigation. Public and auth pages do not
// make authenticated Canvas requests.
export default function CanvasImportNotifications({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { ready, userId } = useWorkspaceSession();
  const treeGeneration = useNoteTreeStore((state) => state.generation);
  const workspacePath =
    pathname === "/notes" ||
    pathname.startsWith("/notes/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");
  return (
    <CanvasImportOwnerProvider
      key={`${userId ?? "no-session"}:${treeGeneration}`}
      enabled={workspacePath && ready && userId !== null}
    >
      {children}
    </CanvasImportOwnerProvider>
  );
}

function CanvasImportOwnerProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const status = useCanvasImportStatus({
    autoCheckOnMount: true,
    enabled,
  });
  return (
    <CanvasImportContext.Provider value={status}>
      {children}
    </CanvasImportContext.Provider>
  );
}
