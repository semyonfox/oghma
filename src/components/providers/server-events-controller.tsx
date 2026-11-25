"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeServerEvents } from "@/lib/server-events/client";

// leaving one of these is the only way a signed-out tab can gain a session
// without a full page load, which would re-read the cookie on the server
const AUTH_PAGE = /^\/(?:login|register|verify-email|auth)(?:\/|$)/;

/**
 * Keeps the tab's event stream open on every signed-in page, not only where
 * something listens for changes, because the open stream is the tab's chat
 * presence. Signed-out visitors never open it.
 */
export default function ServerEventsController({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [session, setSession] = useState({ active: signedIn, path: pathname });
  if (session.path !== pathname) {
    const leftAuthPage = AUTH_PAGE.test(session.path) && !AUTH_PAGE.test(pathname);
    setSession({ active: session.active || leftAuthPage, path: pathname });
  }

  useEffect(() => {
    if (!session.active) return;
    return subscribeServerEvents(() => {});
  }, [session.active]);

  return null;
}
