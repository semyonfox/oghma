"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportTelemetry } from "@/lib/marketing/client";
import type { TelemetryRoute } from "@/lib/telemetry";

export function telemetryRoute(pathname: string | null): TelemetryRoute {
  if (pathname === "/") return "home";
  if (pathname === "/login") return "login";
  if (pathname === "/register" || pathname === "/verify-email") return "onboarding";
  if (pathname === "/settings") return "settings";
  if (pathname === "/notes" || pathname?.startsWith("/notes/")) return "editor";
  if (pathname === "/search") return "search";
  if (pathname === "/privacy" || pathname === "/cookies" || pathname === "/contact") return "help";
  return "app";
}

export default function MarketingTracker() {
  const pathname = usePathname();
  useEffect(() => {
    reportTelemetry({ kind: "count", name: "screen_view", route: telemetryRoute(pathname) });
  }, [pathname]);
  return null;
}
