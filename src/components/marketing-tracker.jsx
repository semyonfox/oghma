"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMarketingEvent } from "@/lib/marketing/client";

const PUBLIC_PATH_PREFIXES = [
  "/", "/about", "/ai", "/agents.md", "/blog", "/contact", "/cookies", "/faq.md",
  "/llms.txt", "/login", "/pricing", "/privacy", "/register", "/syntax-guide", "/terms",
];

function isPublicMarketingPath(pathname) {
  if (!pathname) return false;
  return pathname === "/" || PUBLIC_PATH_PREFIXES.some((prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

function originForInitialPage() {
  if (!document.referrer) return "direct";
  try { return new URL(document.referrer).origin === window.location.origin ? "internal" : "external"; } catch { return "direct"; }
}

function navigationContext(element) {
  const markedPlacement = element.dataset.marketingLocation;
  const markedAction = element.dataset.marketingCta;
  if (markedPlacement || markedAction) return { placement: markedPlacement, action: markedAction };
  if (element.closest("header")) return { placement: "header", action: "nav_link" };
  if (element.closest("footer")) return { placement: "footer", action: "nav_link" };
  return {};
}

function targetPath(element) {
  if (!(element instanceof HTMLAnchorElement) || !element.href) return null;
  try {
    const url = new URL(element.href);
    return url.origin === window.location.origin && isPublicMarketingPath(url.pathname) ? url.pathname : null;
  } catch { return null; }
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
  };
}

export default function MarketingTracker() {
  const pathname = usePathname();
  const previousPath = useRef(null);
  const sentClickTransition = useRef(null);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;
    const currentPath = window.location.pathname;
    if (previousPath.current === currentPath) return;

    const fromPath = previousPath.current;
    const alreadyRecorded = sentClickTransition.current?.fromPath === fromPath && sentClickTransition.current?.toPath === currentPath;
    if (!alreadyRecorded) {
      trackMarketingEvent("navigation_transition", {
        fromPath,
        toPath: currentPath,
        originClass: fromPath ? "internal" : originForInitialPage(),
      });
    }
    sentClickTransition.current = null;
    previousPath.current = currentPath;

    trackMarketingEvent("page_view", {
      source: "public_site",
      properties: { page_group: "public", pathname: currentPath },
    });
  }, [pathname]);

  useEffect(() => {
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!isPublicMarketingPath(window.location.pathname)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest("a,button");
      if (!(element instanceof HTMLElement)) return;

      const eventName = inferClickEvent(element);
      if (eventName) {
        trackMarketingEvent(eventName, {
          source: element.dataset.marketingSource || "public_site",
          targetUrl: element instanceof HTMLAnchorElement ? element.href : element.formAction || null,
          properties: clickProperties(element),
        });
      }

      const toPath = targetPath(element);
      if (!toPath || toPath === window.location.pathname) return;
      const context = navigationContext(element);
      sentClickTransition.current = { fromPath: window.location.pathname, toPath };
      trackMarketingEvent("navigation_transition", {
        fromPath: window.location.pathname,
        toPath,
        originClass: "internal",
        ...context,
      });
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
