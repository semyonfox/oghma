"use client";

import { type FC } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

const ChatSplash: FC = () => (
  <div className="mx-auto w-full max-w-xl rounded-xl border border-border-subtle bg-surface/50 px-4 py-3 text-left shadow-sm">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-500/20 bg-primary-500/10">
        <SparklesIcon className="h-4 w-4 text-primary-400" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-sm font-semibold text-text-secondary">
          OghmaNotes AI
        </h2>
        <p className="text-xs leading-relaxed text-text-tertiary max-w-md">
          Ask anything about your notes, or start a conversation.
        </p>
      </div>
    </div>
  </div>
);

export default ChatSplash;
