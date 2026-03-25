import { useMemo } from 'react';

interface EditorStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  lineCount: number;
  codeBlockCount: number;
  linkCount: number;
}

/**
 * Hook to calculate editor statistics (word count, reading time, etc.)
 * Based on content changes
 */
export const useEditorStats = (content: string): EditorStats => {
  return useMemo(() => {
    const trimmed = content.trim();
    
    // Word count
    const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
    
    // Character count
    const chars = trimmed.length;
    
    // Reading time (average 200 words per minute)
    const readingTime = Math.max(1, Math.ceil(words / 200));
    
    // Line count
    const lines = trimmed.length === 0 ? 0 : trimmed.split('\n').length;
    
    // Code block count (count pairs of ```)
    const codeBlocks = (trimmed.match(/```/g) || []).length / 2;
    
    // Link count ([[...]] syntax)
    const links = (trimmed.match(/\[\[.*?\]\]/g) || []).length;
    
    return {
      wordCount: words,
      charCount: chars,
      readingTime,
      lineCount: lines,
      codeBlockCount: Math.floor(codeBlocks),
      linkCount: links,
    };
  }, [content]);
};
