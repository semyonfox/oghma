'use client';

import SourceEditor from './source-editor';
import PreviewRenderer from './preview-renderer';

interface SplitViewProps {
  content: string;
  onContentChange: (content: string) => void;
}

export default function SplitView({ content, onContentChange }: SplitViewProps) {
  return (
    <div className="h-full flex flex-row gap-0">
      {/* Source editor pane */}
      <div className="flex-1 min-w-0 border-r border-border">
        <div className="h-full flex flex-col">
          <div className="px-4 py-2 bg-background border-b border-border text-sm font-medium text-text-secondary">
            Source
          </div>
          <div className="flex-1">
            <SourceEditor content={content} onContentChange={onContentChange} />
          </div>
        </div>
      </div>
      
      {/* Preview pane */}
      <div className="flex-1 min-w-0">
        <div className="h-full flex flex-col">
          <div className="px-4 py-2 bg-background border-b border-border text-sm font-medium text-text-secondary">
            Preview
          </div>
          <div className="flex-1 overflow-auto">
            <PreviewRenderer content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}
