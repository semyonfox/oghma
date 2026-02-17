'use client';

import { FC, useMemo } from 'react';
import { useEditorStats } from '@/lib/notes/hooks/use-editor-stats';

interface EditorStatusBarProps {
  content: string;
  syncStatus: 'saved' | 'saving' | 'offline' | 'error';
  lastSaved?: Date;
  cursorLine?: number;
  cursorColumn?: number;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

/**
 * Status bar component showing sync status, word count, line position, and zoom
 * Appears at bottom of editor
 */
export const EditorStatusBar: FC<EditorStatusBarProps> = ({
  content,
  syncStatus,
  lastSaved,
  cursorLine = 1,
  cursorColumn = 1,
  zoom = 100,
  onZoomChange,
}) => {
  const stats = useEditorStats(content);

  const syncStatusUI = useMemo(() => {
    switch (syncStatus) {
      case 'saved':
        return (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            {lastSaved
              ? `Saved ${formatTimeAgo(lastSaved)}`
              : 'Saved'}
          </span>
        );
      case 'saving':
        return (
          <span className="text-xs text-blue-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Saving...
          </span>
        );
      case 'offline':
        return (
          <span className="text-xs text-yellow-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            Offline
          </span>
        );
      case 'error':
        return (
          <span className="text-xs text-red-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Sync Error
          </span>
        );
    }
  }, [syncStatus, lastSaved]);

  return (
    <div className="h-8 bg-gray-900 border-t border-gray-700 px-4 flex items-center justify-between text-xs text-gray-400 select-none">
      {/* Left section: Sync status */}
      <div className="flex items-center gap-4">
        {syncStatusUI}
      </div>

      {/* Center section: Stats */}
      <div className="flex items-center gap-6 text-gray-500">
        <span title="Word count">{stats.wordCount} words</span>
        <span className="text-gray-600">•</span>
        <span title="Reading time">{stats.readingTime} min read</span>
        <span className="text-gray-600">•</span>
        <span title="Position">
          Ln {cursorLine}, Col {cursorColumn}
        </span>
      </div>

      {/* Right section: Zoom control */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onZoomChange?.(Math.max(80, zoom - 10))}
          className="px-1.5 py-0.5 hover:bg-gray-700 rounded transition-colors"
          title="Zoom out (Cmd+-)"
        >
          −
        </button>
        <span className="w-10 text-center">{zoom}%</span>
        <button
          onClick={() => onZoomChange?.(Math.min(200, zoom + 10))}
          className="px-1.5 py-0.5 hover:bg-gray-700 rounded transition-colors"
          title="Zoom in (Cmd++)"
        >
          +
        </button>
      </div>
    </div>
  );
};

/**
 * Format a date to a human-readable time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 30) return 'now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
