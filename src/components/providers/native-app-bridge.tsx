"use client";

import { useEffect } from "react";
import { getNativeAppBridge, postNativeTheme } from "@/lib/native-app";

function currentTheme(): "dark" | "light" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function NativeAppBridge() {
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
