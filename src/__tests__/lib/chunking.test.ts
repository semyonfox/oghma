import { describe, it, expect } from 'vitest';
import { chunkText } from '@/lib/rag/chunking';

describe('chunkText', () => {
    it('returns empty array for empty string', () => {
        expect(chunkText('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
        expect(chunkText('   \n\t  ')).toEqual([]);
    });

    it('returns a single chunk when text is shorter than chunkSize', () => {
        const text = 'Hello world. This is a short sentence.';
        const result = chunkText(text, 500);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(text.trim());
    });

    it('splits at sentence boundaries without dropping or duplicating text', () => {
        const sentences = [
            'First sentence here.',
            'Second sentence follows.',
            'Third sentence ends.',
        ];
        expect(chunkText(sentences.join(' '), 30)).toEqual(sentences);
    });

    it('tries clause boundaries before hard chunk cap', () => {
        const clause = 'The first lecture covers the four transaction isolation levels,';
        const longSentence = `${clause} ${'with examples from the course database '.repeat(20)}`;
        const result = chunkText(longSentence, 120);

        expect(result[0]).toBe(clause);
    });

    it('splits long newline-delimited text without punctuation', () => {
        const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join('\n');
        const result = chunkText(text, 100);

        expect(result.length).toBeGreaterThan(1);
        expect(Math.max(...result.map((chunk) => chunk.length))).toBeLessThanOrEqual(200);
        expect(result.join('\n')).toContain('word199');
    });

    it('splits on question marks and exclamation marks without dropping text', () => {
        const sentences = ['What is a graph?', 'A tree is a graph!', 'Done.'];
        expect(chunkText(sentences.join(' '), 20)).toEqual(sentences);
    });

    it('keeps every character when a boundary-free passage is cut', () => {
        const text = 'x'.repeat(250);
        const chunks = chunkText(text, 100);

        expect(chunks.join('')).toBe(text);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(200);
        }
    });

    it('never emits a chunk longer than twice the chunk size', () => {
        // run-on text with few boundaries, the shape of OCR output and code
        const text = [
            'word '.repeat(400),
            'a,b;c:d '.repeat(150),
            'x'.repeat(1_000),
            'Short sentence. '.repeat(30),
        ].join('\n');
        const chunks = chunkText(text, 100);

        expect(chunks.length).toBeGreaterThan(10);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(200);
        }
    });
});
