import { describe, it, expect } from 'vitest';
import {
    isValidEmail,
    validateEmail,
    validatePassword,
    validatePasswordConfirmation,
    validateRequiredFields,
    isNotEmpty,
    validateAuthCredentials,
    sanitizeEmail,
} from '@/lib/validation.js';

describe('isValidEmail', () => {
    it('accepts a standard email', () => {
        expect(isValidEmail('user@example.com')).toBe(true);
    });
    it('accepts email with subdomain', () => {
        expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
    });
    it('rejects email without @', () => {
        expect(isValidEmail('notanemail')).toBe(false);
    });
    it('rejects email without domain', () => {
        expect(isValidEmail('user@')).toBe(false);
    });
    it('rejects empty string', () => {
        expect(isValidEmail('')).toBe(false);
    });
    it('rejects null', () => {
        expect(isValidEmail(null)).toBe(false);
    });
});

describe('validateEmail', () => {
    it('returns isValid true for valid email', () => {
        expect(validateEmail('test@example.com').isValid).toBe(true);
    });
    it('returns error for missing email', () => {
        const result = validateEmail('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeTruthy();
    });
    it('returns error for invalid format', () => {
        const result = validateEmail('bad-email');
        expect(result.isValid).toBe(false);
    });
});

describe('validatePassword', () => {
    it('accepts a strong password', () => {
        const result = validatePassword('StrongPass1');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
    it('rejects password shorter than 8 chars', () => {
        const result = validatePassword('Ab1');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('8 characters'))).toBe(true);
    });
    it('rejects password without uppercase', () => {
        const result = validatePassword('alllower1');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });
    it('rejects password without number', () => {
        const result = validatePassword('NoNumbers!');
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });
    it('rejects null password', () => {
        const result = validatePassword(null);
        expect(result.isValid).toBe(false);
    });
});

describe('validatePasswordConfirmation', () => {
    it('passes when passwords match', () => {
        expect(validatePasswordConfirmation('MyPass1', 'MyPass1').isValid).toBe(true);
    });
    it('fails when passwords do not match', () => {
        const result = validatePasswordConfirmation('MyPass1', 'Different1');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('match');
    });
    it('fails when confirmation is missing', () => {
        expect(validatePasswordConfirmation('MyPass1', '').isValid).toBe(false);
    });
});

describe('validateRequiredFields', () => {
    it('passes when all fields are present', () => {
        const result = validateRequiredFields({ name: 'Alice', email: 'a@b.com' });
        expect(result.isValid).toBe(true);
        expect(result.missingFields).toHaveLength(0);
    });
    it('fails for empty string field', () => {
        const result = validateRequiredFields({ name: '' });
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('name');
    });
    it('fails for null field', () => {
        const result = validateRequiredFields({ age: null });
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('age');
    });
});

describe('isNotEmpty', () => {
    it('returns true for non-empty string', () => {
        expect(isNotEmpty('hello')).toBe(true);
    });
    it('returns false for empty string', () => {
        expect(isNotEmpty('')).toBe(false);
    });
    it('returns false for null', () => {
        expect(isNotEmpty(null)).toBe(false);
    });
    it('returns true for non-empty array', () => {
        expect(isNotEmpty([1])).toBe(true);
    });
    it('returns false for empty array', () => {
        expect(isNotEmpty([])).toBe(false);
    });
});

describe('validateAuthCredentials', () => {
    it('passes for valid login credentials', () => {
        const result = validateAuthCredentials('user@example.com', 'anypassword', false);
        expect(result.isValid).toBe(true);
    });
    it('fails for missing email', () => {
        const result = validateAuthCredentials('', 'password123', false);
        expect(result.isValid).toBe(false);
        expect(result.errors.email).toBeTruthy();
    });
    it('fails for weak password on registration', () => {
        const result = validateAuthCredentials('user@example.com', 'weak', true);
        expect(result.isValid).toBe(false);
        expect(result.errors.password).toBeTruthy();
    });
    it('does not enforce password strength on login', () => {
        // short password should pass auth validation when checkPasswordStrength=false
        const result = validateAuthCredentials('user@example.com', 'weak', false);
        expect(result.isValid).toBe(true);
    });
});

describe('sanitizeEmail', () => {
    it('lowercases and trims email', () => {
        expect(sanitizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });
    it('returns empty string for non-string input', () => {
        expect(sanitizeEmail(null)).toBe('');
    });
});
