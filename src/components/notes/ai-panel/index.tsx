'use client';

import { FC } from 'react';
import { MetadataSection, type Note } from './metadata-section';
import { AIToolsSection } from './ai-tools-section';

export interface AIPanelProps {
  note?: Note | null | undefined;
}

export const AIPanel: FC<AIPanelProps> = ({ note }) => {
  return (
    <div className="ai-panel">
      {/* Metadata Section */}
      <MetadataSection note={note || null} />

      {/* AI Tools Section */}
      {note && <AIToolsSection noteId={note.id} />}
    </div>
  );
};

export default AIPanel;
