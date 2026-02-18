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
      <div className="mb-4 pb-4 border-b border-slate-700">
        <Heading level={3} className="text-sm font-semibold text-slate-300 mb-3">
          Note Info
        </Heading>
        <Text className="text-sm text-slate-400">
          Select a note to view details and AI insights.
        </Text>
      </div>
    );
  }

  return (
    <div className="mb-4 pb-4 border-b border-slate-700 last:border-b-0">
      <Heading level={3} className="text-sm font-semibold text-slate-300 mb-3">
        Note Info
      </Heading>
      <div className="space-y-3">
        <div>
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            ID
          </Text>
          <Text className="font-mono text-xs bg-white/5 p-2 rounded break-all text-slate-400 mt-1">
            {note.id}
          </Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Title
          </Text>
          <Text className="truncate text-slate-400 mt-1">{note.title || 'Untitled'}</Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Word Count
          </Text>
          <Text className="text-slate-400 mt-1">{stats.wordCount} words</Text>
        </div>
        <div>
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Character Count
          </Text>
          <Text className="text-slate-400 mt-1">{stats.charCount} characters</Text>
        </div>
        {note.updatedAt && (
          <div>
            <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Last Modified
            </Text>
            <Text className="text-xs text-slate-400 mt-1">
              {new Date(note.updatedAt).toLocaleDateString()}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetadataSection;
