import { Suspense, type ReactNode } from "react";
import ChatShell from "./chat-shell";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense
        fallback={
          <div aria-hidden="true" className="flex h-dvh w-screen bg-app-page">
            <div className="hidden w-64 shrink-0 border-r border-border px-3 py-4 lg:block">
              <div className="skeleton h-9 w-full rounded-radius-md" />
            </div>
            <div className="flex flex-1 items-end px-4 pb-24 lg:pb-3">
              <div className="skeleton mx-auto h-12 w-full max-w-3xl rounded-radius-xl" />
            </div>
          </div>
        }
      >
        <ChatShell />
      </Suspense>
      {children}
    </>
  );
}
