"use client";

import { FC, useMemo } from "react";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import useI18n from "@/lib/notes/hooks/use-i18n";

/**
 * Format ISO 8601 timestamp to readable date/time string
 */
const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) return "Unknown";
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "Invalid date";
  }
};

export interface Note {
  id: string;
  title?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetadataSectionProps {
  note: Note | null;
}

export const MetadataSection: FC<MetadataSectionProps> = ({ note }) => {
  const { t } = useI18n();
  const stats = useMemo(() => {
    if (!note) {
      return { wordCount: 0, charCount: 0 };
    }
    const content = note.content || "";
    const words = content.split(/\s+/).filter((w) => w.length > 0).length;
    const chars = content.length;
    return { wordCount: words, charCount: chars };
  }, [note]);

  if (!note) {
    return (
      <div className="mb-4 pb-4 border-b border-border last:border-b-0">
        <Heading
          level={3}
          className="text-sm font-semibold text-text-secondary mb-3"
        >
          {t("Note Info")}
        </Heading>
        <Text className="text-sm text-text-tertiary">
          {t("Select a note to view details and AI insights.")}
        </Text>
      </div>
    );
  }

  return (
    <div className="mb-4 pb-4 border-b border-border last:border-b-0">
      <Heading
        level={3}
        className="text-sm font-semibold text-text-secondary mb-3"
      >
        {t("Note Info")}
      </Heading>
      <div className="space-y-3">
        <div>
          <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {t("ID")}
          </Text>
          <Text className="font-mono text-xs bg-subtle p-2 rounded break-all text-text-secondary mt-1">
            {note.id}
          </Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {t("Title")}
          </Text>
          <Text className="truncate text-text-secondary mt-1">
            {note.title || t("Untitled")}
          </Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {t("Word Count")}
          </Text>
          <Text className="text-text-secondary mt-1">
            {stats.wordCount} {t("words")}
          </Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {t("Character Count")}
          </Text>
          <Text className="text-text-secondary mt-1">
            {stats.charCount} {t("characters")}
          </Text>
        </div>
        {note.createdAt && (
          <div>
            <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
              {t("Created")}
            </Text>
            <Text className="text-xs text-text-secondary mt-1">
              {formatTimestamp(note.createdAt)}
            </Text>
          </div>
        )}
        {note.updatedAt && (
          <div>
            <Text className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
              {t("Last Modified")}
            </Text>
            <Text className="text-xs text-text-secondary mt-1">
              {formatTimestamp(note.updatedAt)}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataSection;
