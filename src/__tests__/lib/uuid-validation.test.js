import { describe, it, expect } from 'vitest';
import {
    isValidUUID,
    isValidUUIDv7,
    getValidatedUUID,
    getValidatedUUIDv7,
} from '@/lib/uuid-validation.js';

describe('isValidUUID', () => {
    it('accepts a valid v4 UUID', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('accepts a valid v7 UUID', () => {
        expect(isValidUUID('01963b3a-7c50-7000-8000-000000000001')).toBe(true);
    });

    it('accepts uppercase UUID', () => {
        expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('rejects string without hyphens', () => {
        expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isValidUUID('')).toBe(false);
    });

    it('rejects non-string input', () => {
        expect(isValidUUID(12345)).toBe(false);
        expect(isValidUUID(null)).toBe(false);
        expect(isValidUUID(undefined)).toBe(false);
    });

    it('rejects UUID with wrong length', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('rejects UUID with invalid hex characters', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-44665544zzzz')).toBe(false);
    });
});

describe('isValidUUIDv7', () => {
    it('accepts a valid v7 UUID (version nibble = 7, variant = 8-b)', () => {
        expect(isValidUUIDv7('01963b3a-7c50-7000-8000-000000000001')).toBe(true);
    });

    it('rejects a v4 UUID (version nibble = 4)', () => {
        expect(isValidUUIDv7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('rejects non-string input', () => {
        expect(isValidUUIDv7(null)).toBe(false);
    });

    it('rejects UUID with wrong variant bits', () => {
        // variant nibble must be 8, 9, a, or b — use 0 to fail
        expect(isValidUUIDv7('01963b3a-7c50-7000-0000-000000000001')).toBe(false);
    });
});

describe('getValidatedUUID', () => {
    it('returns the value for a valid UUID', () => {
        const id = '550e8400-e29b-41d4-a716-446655440000';
        expect(getValidatedUUID(id)).toBe(id);
    });

    it('throws for an invalid value', () => {
        expect(() => getValidatedUUID('not-a-uuid')).toThrow('Invalid ID');
    });

    it('includes custom field name in error message', () => {
        expect(() => getValidatedUUID('bad', 'note_id')).toThrow('note_id');
    });
});

describe('getValidatedUUIDv7', () => {
    it('returns value for valid v7 UUID', () => {
        const id = '01963b3a-7c50-7000-8000-000000000001';
        expect(getValidatedUUIDv7(id)).toBe(id);
    });

    it('throws for a v4 UUID', () => {
        expect(() => getValidatedUUIDv7('550e8400-e29b-41d4-a716-446655440000')).toThrow('UUID v7');
    });
});
