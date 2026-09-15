import { describe, it, expect } from 'vitest';
import { generateSecureToken, hashToken } from '@/lib/tokens';

describe('generateSecureToken', () => {
    it('returns a 64-character hex string', () => {
        const token = generateSecureToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns unique tokens on each call', () => {
        const a = generateSecureToken();
        const b = generateSecureToken();
        expect(a).not.toBe(b);
    });
});

describe('hashToken', () => {
    it('returns a 64-character hex string', () => {
        const hash = hashToken('abc123');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns the same hash for the same input', () => {
        const a = hashToken('test-token');
        const b = hashToken('test-token');
        expect(a).toBe(b);
    });

    it('returns different hashes for different inputs', () => {
        const a = hashToken('token-a');
        const b = hashToken('token-b');
        expect(a).not.toBe(b);
    });
});
