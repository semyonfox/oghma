'use client';

import { FC, useRef, useEffect, useState, useCallback } from 'react';
import LexicalEditor from './lexical-editor';
import { LexicalEditorProps } from './lexical-editor';

interface EditorSplitViewProps extends Omit<LexicalEditorProps, 'ref'> {
  showPreview?: boolean;
  onTogglePreview?: (show: boolean) => void;
}

/**
 * Split view editor component with scroll synchronization
 * Shows Markdown editor on left, live preview on right
 * Scroll positions sync between editor and preview
 */
export const EditorSplitView: FC<EditorSplitViewProps> = ({
  showPreview = true,
  onTogglePreview,
  ...editorProps
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const isScrollingEditorRef = useRef(false);
  const isScrollingPreviewRef = useRef(false);

  /**
   * Sync preview scroll to editor scroll position
   * Calculates scroll percentage and applies to preview proportionally
   */
  const handleEditorScroll = useCallback(() => {
    if (!syncScroll || !editorRef.current || !previewRef.current || isScrollingPreviewRef.current) {
      return;
    }

    const editor = editorRef.current;
    const preview = previewRef.current;

    // Calculate scroll percentage
    const editorScrollPercent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    
    // Apply to preview
    isScrollingEditorRef.current = true;
    preview.scrollTop = editorScrollPercent * (preview.scrollHeight - preview.clientHeight || 1);
    
    setTimeout(() => {
      isScrollingEditorRef.current = false;
    }, 100);
  }, [syncScroll]);

  /**
   * Sync editor scroll to preview scroll position
   */
  const handlePreviewScroll = useCallback(() => {
    if (!syncScroll || !editorRef.current || !previewRef.current || isScrollingEditorRef.current) {
      return;
    }

    const editor = editorRef.current;
    const preview = previewRef.current;

    // Calculate scroll percentage
    const previewScrollPercent = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    
    // Apply to editor
    isScrollingPreviewRef.current = true;
    editor.scrollTop = previewScrollPercent * (editor.scrollHeight - editor.clientHeight || 1);
    
    setTimeout(() => {
      isScrollingPreviewRef.current = false;
    }, 100);
  }, [syncScroll]);

  /**
   * Handle click in preview - jump to corresponding position in editor
   * (Future enhancement: could parse line numbers from preview HTML)
   */
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    const preview = previewRef.current;
    const editor = editorRef.current;
    
    if (!preview || !editor) return;

    // Click handler for jumping to source (can be enhanced with better parsing)
    const clickedElement = e.target as HTMLElement;
    if (clickedElement.closest('a[data-link-source]')) {
      // Handle internal links
      const source = clickedElement.getAttribute('data-link-source');
      console.log('Jump to link:', source);
    }
  }, []);

  return (
    <div className="flex h-full gap-2 bg-gray-800">
      {/* Editor pane (left) */}
      <div
        ref={editorRef}
        className="flex-1 overflow-auto"
        onScroll={handleEditorScroll}
      >
       <div className="w-full">
           <LexicalEditor {...editorProps} />
         </div>
      </div>

      {/* Divider (optional: could be draggable in future) */}
      {showPreview && <div className="w-px bg-gray-700" />}

      {/* Preview pane (right) */}
      {showPreview && (
        <div
          ref={previewRef}
          className="flex-1 overflow-auto border-l border-gray-700 p-4"
          onScroll={handlePreviewScroll}
          onClick={handlePreviewClick}
        >
          <div className="prose prose-invert max-w-none">
            {/* Preview content would be rendered here */}
            {/* This would typically use a Markdown renderer component */}
            <div className="text-gray-400 text-sm">
              <p>Live preview coming soon...</p>
              <p className="text-xs text-gray-500">
                Your rendered Markdown will appear here
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorSplitView;
