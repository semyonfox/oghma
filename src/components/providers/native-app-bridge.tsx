"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  getNativeAppBridge,
  postNativeTheme,
  postNativeOfflineAccount,
  syncNativeOfflineAccount,
  supportsNativeOffline,
} from "@/lib/native-app";

function currentTheme(): "dark" | "light" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function NativeAppBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (!supportsNativeOffline()) return;
    if (pathname === "/login" || pathname === "/register") {
      postNativeOfflineAccount(null);
      return;
    }
    const controller = new AbortController();
    // An unavailable server must not erase deliberately downloaded notes.
    void syncNativeOfflineAccount(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [pathname]);
  useEffect(() => {
    if (!getNativeAppBridge()) return;
    const root = document.documentElement;
    const notifyTheme = () => postNativeTheme(currentTheme());

    notifyTheme();
    const observer = new MutationObserver(notifyTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return null;
}
