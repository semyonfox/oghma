import { describe, it, expect } from 'vitest';
import { chunkText } from '@/lib/chunking';

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

    it('splits long text into multiple chunks', () => {
        // build a string clearly longer than 100 chars using multiple sentences
        const sentence = 'This is a sentence that has some words. ';
        const text = sentence.repeat(10); // ~400 chars
        const result = chunkText(text, 100);
        expect(result.length).toBeGreaterThan(1);
    });

    it('each chunk does not exceed chunkSize (with sentence boundary allowance)', () => {
        const sentence = 'Short sentence here. ';
        const text = sentence.repeat(20);
        const chunks = chunkText(text, 100);
        // chunks should be reasonably sized — none absurdly large
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThan(300);
        }
    });

    it('preserves all text content across chunks', () => {
        const sentences = [
            'First sentence here.',
            'Second sentence follows.',
            'Third sentence ends.',
        ];
        const text = sentences.join(' ');
        const chunks = chunkText(text, 30);
        const rejoined = chunks.join(' ');
        // all original words should appear somewhere in the output
        for (const s of sentences) {
            // each sentence's words should appear
            const words = s.replace('.', '').split(' ');
            for (const word of words) {
                expect(rejoined).toContain(word);
            }
        }
    });

    it('uses default chunkSize of 500', () => {
        const text = 'A sentence. '.repeat(5); // ~60 chars total — well under 500
        const result = chunkText(text);
        expect(result).toHaveLength(1);
    });

    it('handles text with no sentence-ending punctuation', () => {
        const text = 'no punctuation here just words and more words repeated many times over and over again yes';
        const result = chunkText(text, 30);
        // should still return something without throwing
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });
});
