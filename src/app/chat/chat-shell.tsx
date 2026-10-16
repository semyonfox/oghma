"use client";

import { usePathname } from "next/navigation";
import ChatPageClient from "./chat-page-client";

/**
 * The chat layout wraps every /chat route, including the standalone action
 * review page. The full-height chat screen would push that page below the
 * fold, so it is skipped there.
 */
export default function ChatShell() {
  const pathname = usePathname();
  if (pathname?.startsWith("/chat/actions/")) return null;
  return <ChatPageClient />;
}
