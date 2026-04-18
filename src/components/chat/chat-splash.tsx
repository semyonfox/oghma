"use client";

import { type FC } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

const ChatSplash: FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
    <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
      <SparklesIcon className="w-6 h-6 text-primary-400" />
    </div>
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-text-secondary">
        OghmaNotes AI
      </h2>
      <p className="text-sm text-text-tertiary max-w-xs">
        Ask anything about your notes, or start a conversation.
      </p>
    </div>
  </div>
);

export default ChatSplash;
