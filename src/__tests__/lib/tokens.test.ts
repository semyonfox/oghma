import { describe, it, expect } from 'vitest';
import { generateSecureToken, hashToken } from '@/lib/auth/tokens';

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
    it('matches the SHA-256 digest used for stored tokens', () => {
        expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        expect(hashToken('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
});
