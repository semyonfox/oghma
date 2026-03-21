// validation utilities for forms, inputs, and auth
import validatorPkg from 'validator';
const { isEmail } = validatorPkg;

// email — uses validator.isEmail for thorough RFC validation
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    return isEmail(email.trim(), { allow_ip_domain: false, require_tld: true });
}

export function validateEmail(email) {
    if (!email || typeof email !== 'string' || email.trim() === '') {
        return { isValid: false, error: 'Email is required' };
    }

    if (!isValidEmail(email)) {
        return { isValid: false, error: 'Invalid email format' };
    }

    return { isValid: true, error: null };
}

// password

export function validatePassword(password, options = {}) {
    const {
        minLength = 8,
        requireUppercase = true,
        requireLowercase = true,
        requireNumber = true,
        requireSpecialChar = false,
    } = options;

    const errors = [];

    if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { isValid: false, errors };
    }

    if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters long`);
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (requireNumber && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

export function isStrongPassword(password) {
    const validation = validatePassword(password);
    return validation.isValid;
}

export function validatePasswordConfirmation(password, confirmPassword) {
    if (!confirmPassword) {
        return { isValid: false, error: 'Password confirmation is required' };
    }

    if (password !== confirmPassword) {
        return { isValid: false, error: 'Passwords do not match' };
    }

    return { isValid: true, error: null };
}

// required fields

export function validateRequiredFields(fields) {
    const missingFields = [];

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
        if (
            fieldValue == null ||
            fieldValue === '' ||
            (typeof fieldValue === 'string' && fieldValue.trim() === '')
        ) {
            missingFields.push(fieldName);
        }
    }

    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

export function isNotEmpty(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

// auth credentials

export function validateAuthCredentials(email, password, checkPasswordStrength = false) {
    const errors = {};

    const requiredValidation = validateRequiredFields({ email, password });
    if (!requiredValidation.isValid) {
        requiredValidation.missingFields.forEach(field => {
            errors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
        });
    }

    if (email && !isValidEmail(email)) {
        errors.email = 'Invalid email format';
    }

    if (checkPasswordStrength && password) {
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            errors.password = passwordValidation.errors.join('; ');
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// form helpers

/**
 * validates multiple fields using a map of validator functions.
 *
 * usage:
 *   validateForm(
 *     { email: (v) => validateEmail(v), age: (v) => validateNumberRange(v, 18, 100) },
 *     { email: 'test@example.com', age: 25 }
 *   )
 */
export function validateForm(validators, data) {
    const errors = {};

    for (const [field, validator] of Object.entries(validators)) {
        const result = validator(data[field]);
        if (result && !result.isValid && result.error) {
            errors[field] = result.error;
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

export function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim();
}

export function sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    return email.trim().toLowerCase();
}

export default {
    isValidEmail,
    validateEmail,
    sanitizeEmail,
    validatePassword,
    isStrongPassword,
    validatePasswordConfirmation,
    validateRequiredFields,
    isNotEmpty,
    validateAuthCredentials,
    validateForm,
};
