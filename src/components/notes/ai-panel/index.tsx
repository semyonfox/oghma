'use client';

import { FC } from 'react';
import { MetadataSection, type Note } from './metadata-section';
import { AIToolsSection } from './ai-tools-section';

export interface AIPanelProps {
  note?: Note | null | undefined;
}

export const AIPanel: FC<AIPanelProps> = ({ note }) => {
  return (
    <div className="h-full bg-slate-800 border-l border-slate-700 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Metadata Section */}
      <MetadataSection note={note || null} />

      {/* AI Tools Section */}
      {note && <AIToolsSection noteId={note.id} />}
    </div>
  );
};

export default AIPanel;
