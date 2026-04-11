import { Suspense } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

import ChatPageClient from "../chat-page-client";

export default function ChatSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-app-page">
          <SparklesIcon className="w-8 h-8 text-primary-400 animate-pulse" />
        </div>
      }
    >
      <ChatPageClient />
    </Suspense>
  );
}
