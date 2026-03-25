'use client';

import { useEffect, useRef, useState } from 'react';
import useNoteStore from '@/lib/notes/state/note';
import useEditorStore from '@/lib/notes/state/editor.zustand';
import useI18n from '@/lib/notes/hooks/use-i18n';

interface SourceEditorProps {
  content: string;
  onContentChange: (content: string) => void;
}

export default function SourceEditor({ content, onContentChange }: SourceEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState(content);
  const { saveNow } = useEditorStore();
  const { t } = useI18n();

  // sync content when prop changes
  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    onContentChange(newContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ctrl+s or cmd+s to save the current content using Zustand's saveNow()
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNow();
    }

    // tab key inserts two spaces at cursor position without losing focus on textarea
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newContent = localContent.substring(0, start) + '  ' + localContent.substring(end);
      setLocalContent(newContent);
      onContentChange(newContent);
      
      // restore cursor position after state update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={localContent}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className="w-full h-full p-4 font-mono text-sm bg-background text-text-secondary border-none outline-none resize-none transition-all"
      placeholder={t('Write your markdown here...')}
      spellCheck={false}
      dir="ltr"
    />
  );
}
