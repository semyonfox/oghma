"use client";

import { FC, useMemo } from "react";
import { useEditorStats } from "@/lib/notes/hooks/use-editor-stats";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface EditorStatusBarProps {
  content: string;
  syncStatus: "saved" | "saving" | "offline" | "error";
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
  cursorLine: _cursorLine = 1,
  cursorColumn: _cursorColumn = 1,
  zoom: _zoom = 100,
  onZoomChange: _onZoomChange,
}) => {
  const { t } = useI18n();
  const stats = useEditorStats(content);

  const syncStatusUI = useMemo(() => {
    switch (syncStatus) {
      case "saved":
        return (
          <span className="text-[11px] text-text-tertiary flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-green-500"></span>
            {lastSaved
              ? `${t("Saved")} ${formatTimeAgo(lastSaved)}`
              : t("Saved")}
          </span>
        );
      case "saving":
        return (
          <span className="text-[11px] text-text-tertiary flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-primary-500 animate-pulse"></span>
            {t("Saving...")}
          </span>
        );
      case "offline":
        return (
          <span className="text-[11px] text-text-tertiary flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-yellow-500"></span>
            {t("Offline")}
          </span>
        );
      case "error":
        return (
          <span className="text-[11px] text-text-tertiary flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-error-500"></span>
            {t("Sync Error")}
          </span>
        );
    }
  }, [syncStatus, lastSaved, t]);

  return (
    <div className="h-6 bg-background border-t border-border-subtle px-4 flex items-center justify-between text-[11px] text-text-tertiary select-none">
      {/* Left section: Sync status */}
      <div className="flex items-center gap-3">{syncStatusUI}</div>

      {/* Center section: Word count only */}
      <span title={t("Word count")} className="text-text-tertiary">
        {stats.wordCount} {t("words")}
      </span>

      {/* Right: Empty (removed zoom, cursor position, reading time) */}
      <div />
    </div>
  );
};

/**
 * Format a date to a human-readable time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 30) return "now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
