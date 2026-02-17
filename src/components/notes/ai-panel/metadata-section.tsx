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
      <div className="ai-section">
        <Heading level={3} className="ai-section-title">
          Note Info
        </Heading>
        <Text className="text-sm text-text-secondary">
          Select a note to view details and AI insights.
        </Text>
      </div>
    );
  }

  return (
    <div className="ai-section">
      <Heading level={3} className="ai-section-title">
        Note Info
      </Heading>
      <div className="ai-section-content">
        <div>
          <Text className="ai-metadata-label">
            ID
          </Text>
          <Text className="font-mono text-xs bg-white/5 p-2 rounded break-all text-text-secondary mt-1">
            {note.id}
          </Text>
        </div>
        <div>
          <Text className="ai-metadata-label">
            Title
          </Text>
          <Text className="truncate text-text-secondary mt-1">{note.title || 'Untitled'}</Text>
        </div>
        <div>
          <Text className="ai-metadata-label">
            Word Count
          </Text>
          <Text className="text-text-secondary mt-1">{stats.wordCount} words</Text>
        </div>
        <div>
          <Text className="ai-metadata-label">
            Character Count
          </Text>
          <Text className="text-text-secondary mt-1">{stats.charCount} characters</Text>
        </div>
        {note.updatedAt && (
          <div>
            <Text className="ai-metadata-label">
              Last Modified
            </Text>
            <Text className="text-xs text-text-secondary mt-1">
              {new Date(note.updatedAt).toLocaleDateString()}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataSection;
