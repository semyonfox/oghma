import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt, parseGeneratedQuestion } from '@/lib/quiz/generate';

describe('question generation', () => {
    it('builds a prompt with chunk text and bloom level', () => {
        const prompt = buildGenerationPrompt(
            'Pipelining overlaps fetch, decode, execute stages.',
            'CT213 - Computer Systems',
            2,
            'mcq',
        );
        expect(prompt).toContain('Pipelining overlaps');
        expect(prompt).toContain('CT213');
        expect(prompt).toContain('Understand');
        expect(prompt).toContain('mcq');
    });

    it('parses valid LLM JSON response', () => {
        const raw = JSON.stringify({
            question_text: 'Why does pipelining improve throughput?',
            options: [
                { text: 'Reduces clock speed', is_correct: false },
                { text: 'Overlaps stages', is_correct: true },
                { text: 'Increases memory', is_correct: false },
                { text: 'Simplifies design', is_correct: false },
            ],
            correct_answer: 'Overlaps stages',
            explanation: 'Pipelining overlaps instruction stages.',
        });
        const result = parseGeneratedQuestion(raw);
        expect(result).not.toBeNull();
        expect(result!.question_text).toBe('Why does pipelining improve throughput?');
        expect(result!.options).toHaveLength(4);
        expect(result!.options!.filter(o => o.is_correct)).toHaveLength(1);
    });

    it('returns null for invalid JSON', () => {
        expect(parseGeneratedQuestion('not json')).toBeNull();
        expect(parseGeneratedQuestion('{"question_text": ""}')).toBeNull();
    });
});
