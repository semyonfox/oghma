import { describe, it, expect } from 'vitest';
import { parseMarkdownTitle } from '@/lib/notes/markdown/parse-markdown-title';

describe('parseMarkdownTitle', () => {
    it('extracts title from # heading', () => {
        const result = parseMarkdownTitle('# My Title\nsome content');
        expect(result.title).toBe('My Title');
    });

    it('strips the heading line from content', () => {
        const result = parseMarkdownTitle('# My Title\nsome content');
        expect(result.content).not.toContain('# My Title');
        expect(result.content).toContain('some content');
    });

    it('returns undefined title when no heading found', () => {
        const result = parseMarkdownTitle('no heading here\njust text');
        expect(result.title).toBeUndefined();
        expect(result.content).toContain('no heading here');
    });

    it('ignores ## and deeper headings', () => {
        const result = parseMarkdownTitle('## Subheading\ncontent');
        expect(result.title).toBeUndefined();
    });

    it('handles heading with trailing hashes', () => {
        const result = parseMarkdownTitle('# Title ##\ncontent');
        expect(result.title).toBe('Title ');
    });

    it('handles heading not on first line', () => {
        const result = parseMarkdownTitle('preamble\n# Actual Title\ncontent');
        expect(result.title).toBe('Actual Title');
    });

    it('handles empty string', () => {
        const result = parseMarkdownTitle('');
        expect(result.title).toBeUndefined();
        expect(result.content).toBe('');
    });

    it('handles heading with only whitespace after #', () => {
        const result = parseMarkdownTitle('#  \ncontent');
        // regex matches "#  " as a heading with whitespace-only title
        // the heading line gets stripped, so content may be just the remainder
        expect(result.title).toBeDefined();
    });
});
