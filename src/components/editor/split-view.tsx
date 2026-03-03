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
      <div className="flex-1 min-w-0 border-r border-border dark:border-neutral-700">
        <div className="h-full flex flex-col">
          <div className="px-4 py-2 bg-background dark:bg-neutral-800 border-b border-border dark:border-neutral-700 text-sm font-medium text-text-secondary dark:text-neutral-400">
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
          <div className="px-4 py-2 bg-background dark:bg-neutral-800 border-b border-border dark:border-neutral-700 text-sm font-medium text-text-secondary dark:text-neutral-400">
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
