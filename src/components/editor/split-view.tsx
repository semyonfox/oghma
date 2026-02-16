'use client';

import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import SourceEditor from './source-editor';
import PreviewRenderer from './preview-renderer';

interface SplitViewProps {
  content: string;
  onContentChange: (content: string) => void;
}

export default function SplitView({ content, onContentChange }: SplitViewProps) {
  return (
    <Allotment>
      <Allotment.Pane minSize={300}>
        <div className="h-full border-r border-border dark:border-neutral-700">
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 bg-background dark:bg-neutral-800 border-b border-border dark:border-neutral-700 text-sm font-medium text-text-secondary dark:text-neutral-400">
              Source
            </div>
            <div className="flex-1">
              <SourceEditor content={content} onContentChange={onContentChange} />
            </div>
          </div>
        </div>
      </Allotment.Pane>
      <Allotment.Pane minSize={300}>
        <div className="h-full">
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 bg-background dark:bg-neutral-800 border-b border-border dark:border-neutral-700 text-sm font-medium text-text-secondary dark:text-neutral-400">
              Preview
            </div>
            <div className="flex-1 overflow-auto">
              <PreviewRenderer content={content} />
            </div>
          </div>
        </div>
      </Allotment.Pane>
    </Allotment>
  );
}
