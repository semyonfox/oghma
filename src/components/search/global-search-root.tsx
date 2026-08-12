"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isGlobalSearchRoute } from "@/lib/global-search/routes";

const GlobalSearchModal = dynamic(() => import("./global-search-modal"), {
  ssr: false,
});

export default function GlobalSearchRoot() {
  const pathname = usePathname();

  if (!isGlobalSearchRoute(pathname)) return null;

  return <GlobalSearchModal />;
}
