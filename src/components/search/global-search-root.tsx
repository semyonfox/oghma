"use client";

import dynamic from "next/dynamic";

const GlobalSearchModal = dynamic(() => import("./global-search-modal"), {
  ssr: false,
});

export default function GlobalSearchRoot() {
  return <GlobalSearchModal />;
}
