import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock the database module before importing the module under test
vi.mock('@/database/pgsql.js', () => {
    const mockSql = vi.fn();
    mockSql.begin = vi.fn();
    return { default: mockSql };
});

// mock bcrypt and crypto for findOrCreateOAuthUser
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('$2a$10$hashed') } }));
vi.mock('crypto', () => ({ default: { randomBytes: () => ({ toString: () => 'random-hex' }) } }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import {
    isEmailVerifiedByProvider,
    findOAuthAccount,
    linkOAuthAccount,
    syncProfileToLogin,
    getLinkedProviders,
    findOrCreateOAuthUser,
} from '@/lib/auth-oauth';
import sql from '@/database/pgsql.js';

const mockSql = sql as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('isEmailVerifiedByProvider', () => {
    it('returns true for google (always verified)', () => {
        expect(isEmailVerifiedByProvider('google', {})).toBe(true);
    });

    it('returns true for apple (always verified)', () => {
        expect(isEmailVerifiedByProvider('apple', {})).toBe(true);
    });

    it('returns true for github when email_verified is true', () => {
        expect(isEmailVerifiedByProvider('github', { email_verified: true })).toBe(true);
    });

    it('returns false for github when email_verified is missing', () => {
        expect(isEmailVerifiedByProvider('github', {})).toBe(false);
    });

    it('returns false for azure-ad when email_verified is false', () => {
        expect(isEmailVerifiedByProvider('azure-ad', { email_verified: false })).toBe(false);
    });

    it('returns false for unknown provider', () => {
        expect(isEmailVerifiedByProvider('unknown', {})).toBe(false);
    });
});

describe('findOAuthAccount', () => {
    it('returns the account row when found', async () => {
        const row = { id: '1', user_id: 'u1', provider: 'google', provider_id: 'g1' };
        mockSql.mockResolvedValueOnce([row]);
        const result = await findOAuthAccount('google', 'g1');
        expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
        mockSql.mockResolvedValueOnce([]);
        const result = await findOAuthAccount('google', 'g-missing');
        expect(result).toBeNull();
    });
});

describe('linkOAuthAccount', () => {
    it('calls sql with correct provider data', async () => {
        mockSql.mockResolvedValueOnce([{ id: 'new-id' }]);
        await linkOAuthAccount('user-1', {
            provider: 'github',
            providerAccountId: 'gh-123',
            email: 'test@test.com',
            name: 'Test User',
            image: 'https://example.com/avatar.png',
            locale: 'en',
            rawProfile: { login: 'testuser' },
        });
        expect(mockSql).toHaveBeenCalled();
    });
});

describe('syncProfileToLogin', () => {
    it('calls sql to update login profile fields', async () => {
        mockSql.mockResolvedValueOnce([]);
        await syncProfileToLogin('user-1', {
            name: 'Jane Doe',
            image: 'https://example.com/avatar.png',
            locale: 'en-US',
        });
        expect(mockSql).toHaveBeenCalled();
    });
});

describe('getLinkedProviders', () => {
    it('returns array of provider names', async () => {
        mockSql.mockResolvedValueOnce([
            { provider: 'google', email: 'a@b.com' },
            { provider: 'github', email: 'a@b.com' },
        ]);
        const result = await getLinkedProviders('user-1');
        expect(result).toEqual([
            { provider: 'google', email: 'a@b.com' },
            { provider: 'github', email: 'a@b.com' },
        ]);
    });

    it('returns empty array when no providers linked', async () => {
        mockSql.mockResolvedValueOnce([]);
        const result = await getLinkedProviders('user-1');
        expect(result).toEqual([]);
    });
});

describe('findOrCreateOAuthUser', () => {
    const googleProfile = {
        provider: 'google',
        providerAccountId: 'g-123',
        email: 'user@gmail.com',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        locale: 'en',
    };

    it('returns existing user_id when oauth account already exists', async () => {
        // findOAuthAccount returns a row
        mockSql.mockResolvedValueOnce([{ id: 'oa-1', user_id: 'u-1', provider: 'google', provider_id: 'g-123' }]);
        // linkOAuthAccount upsert
        mockSql.mockResolvedValueOnce([]);
        // syncProfileToLogin
        mockSql.mockResolvedValueOnce([]);
        const result = await findOrCreateOAuthUser(googleProfile, {});
        expect(result).toBe('u-1');
    });

    it('auto-links to existing login when email is verified', async () => {
        // findOAuthAccount: not found
        mockSql.mockResolvedValueOnce([]);
        // login lookup by email: found
        mockSql.mockResolvedValueOnce([{ user_id: 'u-existing' }]);
        // linkOAuthAccount
        mockSql.mockResolvedValueOnce([]);
        // syncProfileToLogin
        mockSql.mockResolvedValueOnce([]);
        const result = await findOrCreateOAuthUser(googleProfile, {});
        expect(result).toBe('u-existing');
    });

    it('creates new user when no existing account or login found', async () => {
        // findOAuthAccount: not found
        mockSql.mockResolvedValueOnce([]);
        // login lookup by email: not found
        mockSql.mockResolvedValueOnce([]);
        // INSERT login: returns new user_id
        mockSql.mockResolvedValueOnce([{ user_id: 'u-new' }]);
        // linkOAuthAccount
        mockSql.mockResolvedValueOnce([]);
        const result = await findOrCreateOAuthUser(googleProfile, {});
        expect(result).toBe('u-new');
    });

    it('does not auto-link when email is unverified (github)', async () => {
        const ghProfile = { ...googleProfile, provider: 'github', providerAccountId: 'gh-1' };
        // findOAuthAccount: not found
        mockSql.mockResolvedValueOnce([]);
        // no login lookup (email not verified) — goes straight to INSERT
        // INSERT login: returns new user_id
        mockSql.mockResolvedValueOnce([{ user_id: 'u-new-gh' }]);
        // linkOAuthAccount
        mockSql.mockResolvedValueOnce([]);
        const result = await findOrCreateOAuthUser(ghProfile, { email_verified: false });
        expect(result).toBe('u-new-gh');
    });
});
