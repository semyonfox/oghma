"use client";

// Route-local shell for the notes workspace. Global concerns such as locale
// selection belong to the root provider, not to an individual feature route.
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import dynamic from "next/dynamic";

const TrashModal = dynamic(() => import("@/components/notes/trash-modal"), { ssr: false });
const PreviewModal = dynamic(() => import("@/components/notes/preview-modal"), { ssr: false });
const LinkToolbar = dynamic(() => import("@/components/notes/link-toolbar"), { ssr: false });

interface NotesProvidersProps {
  children: ReactNode;
}

export default function NotesProviders({ children }: NotesProvidersProps) {
  return (
    <ErrorBoundary>
      {children}
      <TrashModal />
      <PreviewModal />
      <LinkToolbar />
    </ErrorBoundary>
  );
}
