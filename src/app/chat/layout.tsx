import { Suspense, type ReactNode } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import ChatShell from "./chat-shell";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-app-page">
            <SparklesIcon className="h-8 w-8 animate-pulse text-primary-400" />
          </div>
        }
      >
        <ChatShell />
      </Suspense>
      {children}
    </>
  );
}
