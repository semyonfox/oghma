'use client';

import { FC, useMemo } from 'react';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';

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
  const stats = useMemo(() => {
    if (!note) {
      return { wordCount: 0, charCount: 0 };
    }
    const content = note.content || '';
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    const chars = content.length;
    return { wordCount: words, charCount: chars };
  }, [note]);

  if (!note) {
    return (
      <>
        <Heading level={3} className="text-sm font-semibold mb-4 text-text">
          Note Info
        </Heading>
        <Text className="text-sm text-text-tertiary">
          Select a note to view details and AI insights.
        </Text>
      </>
    );
  }

  return (
    <>
      <Heading level={3} className="text-sm font-semibold mb-4 text-text">
        Note Info
      </Heading>
      <div className="space-y-3 text-sm text-text-tertiary">
        <div>
          <Text className="text-xs text-text-secondary font-semibold mb-1">
            ID
          </Text>
          <Text className="font-mono text-xs bg-background p-2 rounded break-all">
            {note.id}
          </Text>
        </div>
        <div>
          <Text className="text-xs text-text-secondary font-semibold mb-1">
            Title
          </Text>
          <Text className="truncate">{note.title || 'Untitled'}</Text>
        </div>
        <div>
          <Text className="text-xs text-text-secondary font-semibold mb-1">
            Word Count
          </Text>
          <Text>{stats.wordCount} words</Text>
        </div>
        <div>
          <Text className="text-xs text-text-secondary font-semibold mb-1">
            Character Count
          </Text>
          <Text>{stats.charCount} characters</Text>
        </div>
        {note.updatedAt && (
          <div>
            <Text className="text-xs text-text-secondary font-semibold mb-1">
              Last Modified
            </Text>
            <Text className="text-xs">
              {new Date(note.updatedAt).toLocaleDateString()}
            </Text>
          </div>
        )}
      </div>
    </>
  );
};

export default MetadataSection;
