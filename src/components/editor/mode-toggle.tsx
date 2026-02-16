'use client';

import EditorModeState, { EditorMode } from '@/lib/notes/state/editor-mode';
import { useState } from 'react';

const modeConfig: Record<EditorMode, { icon: string; label: string; description: string; color: string }> = {
  edit: {
    icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    label: 'Edit Mode (WYSIWYG)',
    description: 'Rich text editor with live formatting',
    color: 'text-success-500',
  },
  source: {
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    label: 'Source Mode',
    description: 'Edit raw markdown',
    color: 'text-primary-500',
  },
  preview: {
    icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    label: 'Preview Mode',
    description: 'Read-only rendered view',
    color: 'text-secondary-500',
  },
  split: {
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7',
    label: 'Split View',
    description: 'Source and preview side-by-side',
    color: 'text-ai-500',
  },
};

export default function EditorModeToggle() {
  const { mode, cycleMode } = EditorModeState.useContainer();
  const config = modeConfig[mode];
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => cycleMode()}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`p-2 rounded-lg transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${config.color}`}
        aria-label={config.label}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={config.icon} />
        </svg>
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 w-48 p-2 bg-neutral-800 text-white text-xs rounded-lg shadow-lg z-50 pointer-events-none">
          <div className="font-semibold mb-1">{config.label}</div>
          <div className="opacity-90">{config.description}</div>
          <div className="opacity-75 mt-1">Click to cycle modes</div>
        </div>
      )}
    </div>
  );
}
