import { describe, it, expect } from 'vitest';
import { generateSecureToken, hashToken, verifyTokenHash } from '@/lib/tokens.js';

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

describe('verifyTokenHash', () => {
    it('returns true when raw token matches stored hash', () => {
        const raw = generateSecureToken();
        const stored = hashToken(raw);
        expect(verifyTokenHash(raw, stored)).toBe(true);
    });

    it('returns false when raw token does not match stored hash', () => {
        const raw = generateSecureToken();
        const stored = hashToken('different-token');
        expect(verifyTokenHash(raw, stored)).toBe(false);
    });
});
