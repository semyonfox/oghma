"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMarketingEvent } from "@/lib/marketing/client";

const PUBLIC_PATH_PREFIXES = [
  "/",
  "/about",
  "/ai",
  "/blog",
  "/contact",
  "/login",
  "/pricing",
  "/register",
];

function isPublicMarketingPath(pathname) {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => prefix !== "/" && pathname.startsWith(prefix),
  );
}

function elementText(element) {
  const label =
    element.dataset.marketingLabel ||
    element.getAttribute("aria-label") ||
    element.textContent ||
    "";
  return label.replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
}

function targetUrl(element) {
  if (element instanceof HTMLAnchorElement) return element.href;
  if (element instanceof HTMLButtonElement) return element.formAction || null;
  return null;
}

function inferClickEvent(element) {
  if (element.dataset.marketingEvent) return element.dataset.marketingEvent;
  if (element instanceof HTMLAnchorElement) return "nav_click";
  return null;
}

function clickProperties(element) {
  return {
    page: element.dataset.marketingPage,
    location: element.dataset.marketingLocation,
    cta: element.dataset.marketingCta,
    audience: element.dataset.marketingAudience,
    label: elementText(element),
  };
}

export default function MarketingTracker() {
  const pathname = usePathname();
  const previousPath = useRef(null);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (previousPath.current === currentPath) return;
    previousPath.current = currentPath;

    trackMarketingEvent("page_view", {
      source: "public_site",
      properties: {
        page_group: "public",
        pathname: window.location.pathname,
      },
    });
  }, [pathname]);

  useEffect(() => {
    function onClick(event) {
      if (!isPublicMarketingPath(window.location.pathname)) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const element = target.closest("a,button");
      if (!(element instanceof HTMLElement)) return;

      const eventName = inferClickEvent(element);
      if (!eventName) return;

      trackMarketingEvent(eventName, {
        source: element.dataset.marketingSource || "public_site",
        targetUrl: targetUrl(element),
        properties: clickProperties(element),
      });
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return null;
}
