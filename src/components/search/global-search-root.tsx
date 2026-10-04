"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isGlobalSearchRoute } from "@/lib/global-search/routes";
import useGlobalSearchStore from "@/lib/global-search/state";

const GlobalSearchModal = dynamic(() => import("./global-search-modal"), {
  ssr: false,
});

export default function GlobalSearchRoot() {
  const pathname = usePathname();
  const visible = useGlobalSearchStore((state) => state.visible);
  const open = useGlobalSearchStore((state) => state.open);
  const close = useGlobalSearchStore((state) => state.close);
  const enabled = isGlobalSearchRoute(pathname);

  useEffect(() => {
    if (!enabled && visible) close();
  }, [close, enabled, visible]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, open]);

  if (!enabled || !visible) return null;

  return <GlobalSearchModal />;
}
