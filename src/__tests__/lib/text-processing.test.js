import { describe, it, expect } from 'vitest';
import { processExtractedText } from '@/lib/canvas/text-processing.js';

describe('processExtractedText', () => {
    it('removes common stop words', () => {
        const result = processExtractedText('the quick brown fox is a very fast animal');
        expect(result).not.toMatch(/\bthe\b/);
        expect(result).not.toMatch(/\bis\b/);
        expect(result).not.toMatch(/\ba\b/);
        expect(result).toContain('quick');
        expect(result).toContain('brown');
        expect(result).toContain('fox');
    });

    it('removes pure numbers (page numbers, years etc.)', () => {
        const result = processExtractedText('Chapter 12 Page 45 Introduction Algorithms');
        expect(result).not.toMatch(/\b12\b/);
        expect(result).not.toMatch(/\b45\b/);
        expect(result).toContain('Chapter');
        expect(result).toContain('Introduction');
    });

    it('removes single characters', () => {
        const result = processExtractedText('a x b word1 c test');
        // single chars like x, b, c should be stripped
        expect(result).not.toMatch(/\bx\b/);
        expect(result).not.toMatch(/\bb\b/);
        expect(result).not.toMatch(/\bc\b/);
        expect(result).toContain('word1');
        expect(result).toContain('test');
    });

    it('removes symbol-only tokens', () => {
        const result = processExtractedText('--- hello ... world ### (())');
        expect(result).not.toContain('---');
        expect(result).not.toContain('...');
        expect(result).not.toContain('###');
        expect(result).toContain('hello');
        expect(result).toContain('world');
    });

    it('normalises Windows line endings and tabs', () => {
        const result = processExtractedText('hello\r\nworld\ttest');
        expect(result).toContain('hello');
        expect(result).toContain('world');
        expect(result).toContain('test');
        expect(result).not.toContain('\r');
        expect(result).not.toContain('\t');
    });

    it('collapses multiple spaces into single spaces', () => {
        const result = processExtractedText('hello     world     test');
        expect(result).not.toMatch(/  /);
    });

    it('trims leading and trailing whitespace', () => {
        const result = processExtractedText('   hello world   ');
        expect(result).toBe(result.trim());
    });

    it('keeps tokens that contain letters mixed with numbers', () => {
        const result = processExtractedText('TCP/IP v2 algorithm1 http2');
        expect(result).toContain('TCP/IP');
        expect(result).toContain('v2');
        expect(result).toContain('algorithm1');
        expect(result).toContain('http2');
    });

    it('returns empty string for input of only stop words and noise', () => {
        const result = processExtractedText('the is a 1 2 3 --- ...');
        expect(result).toBe('');
    });
});
