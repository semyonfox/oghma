/**
 * Validation Utilities
 * Provides reusable validation functions for forms, inputs, and data
 * Consolidates all validation logic in one place
 */

// ============================================================
// EMAIL VALIDATION
// ============================================================

/**
 * Validates email format using regex
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    // RFC 5322 simplified email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Validates email and returns detailed error
 * @param {string} email - Email address to validate
 * @returns {{ isValid: boolean, error: string|null }} - Validation result with error message
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string' || email.trim() === '') {
        return { isValid: false, error: 'Email is required' };
    }

    if (!isValidEmail(email)) {
        return { isValid: false, error: 'Invalid email format' };
    }

    return { isValid: true, error: null };
}

// ============================================================
// PASSWORD VALIDATION (Might be replaced in the future for a package)
// ============================================================

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum password length (default: 8)
 * @param {boolean} options.requireUppercase - Require uppercase letter (default: true)
 * @param {boolean} options.requireLowercase - Require lowercase letter (default: true)
 * @param {boolean} options.requireNumber - Require number (default: true)
 * @param {boolean} options.requireSpecialChar - Require special character (default: false)
 * @returns {{ isValid: boolean, errors: string[] }} - Validation result with specific errors
 */
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

/**
 * Check if password meets minimum requirements (quick check)
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets basic requirements
 */
export function isStrongPassword(password) {
    const validation = validatePassword(password);
    return validation.isValid;
}

/**
 * Validates password confirmation matches original password
 * @param {string} password - Original password
 * @param {string} confirmPassword - Confirmation password
 * @returns {{ isValid: boolean, error: string|null }} - Validation result
 */
export function validatePasswordConfirmation(password, confirmPassword) {
    if (!confirmPassword) {
        return { isValid: false, error: 'Password confirmation is required' };
    }

    if (password !== confirmPassword) {
        return { isValid: false, error: 'Passwords do not match' };
    }

    return { isValid: true, error: null };
}

// ============================================================
// REQUIRED FIELDS VALIDATION
// ============================================================

/**
 * Validates required fields are present and not empty
 * @param {Object} fields - Object with field names as keys and values to validate
 * @returns {{ isValid: boolean, missingFields: string[] }} - Validation result
 */
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

/**
 * Check if a single field is not empty
 * @param {any} value - Value to check
 * @returns {boolean} - True if value is not empty
 */
export function isNotEmpty(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

// ============================================================
// AUTHENTICATION-SPECIFIC VALIDATION
// ============================================================

/**
 * Validates authentication credentials (email and password)
 * @param {string} email - Email to validate
 * @param {string} password - Password to validate
 * @param {boolean} checkPasswordStrength - Whether to check password strength (true for registration)
 * @returns {{ isValid: boolean, errors: Object }} - Validation result with specific errors
 */
export function validateAuthCredentials(email, password, checkPasswordStrength = false) {
    const errors = {};

    // Validate required fields
    const requiredValidation = validateRequiredFields({ email, password });
    if (!requiredValidation.isValid) {
        requiredValidation.missingFields.forEach(field => {
            errors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
        });
    }

    // Validate email format
    if (email && !isValidEmail(email)) {
        errors.email = 'Invalid email format';
    }

    // Validate password strength (for registration)
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

// ============================================================
// FORM VALIDATION HELPERS
// ============================================================

/**
 * Validates multiple fields and collects all errors
 * @param {Object} validators - Object with field names as keys and validator functions as values
 * @param {Object} data - Object with field names as keys and values to validate
 * @returns {{ isValid: boolean, errors: Object }} - Validation result with all errors
 *
 * @example
 * const result = validateForm(
 *   {
 *     email: (value) => validateEmail(value),
 *     age: (value) => validateNumberRange(value, 18, 100)
 *   },
 *   { email: 'test@example.com', age: 25 }
 * );
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

/**
 * Sanitize string by trimming whitespace
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim();
}

/**
 * Sanitize email by converting to lowercase and trimming
 * @param {string} email - Email to sanitize
 * @returns {string} - Sanitized email
 */
export function sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    return email.trim().toLowerCase();
}

// ============================================================
// EXPORTS
// ============================================================

export default {
    // Email
    isValidEmail,
    validateEmail,
    sanitizeEmail,

    // Password
    validatePassword,
    isStrongPassword,
    validatePasswordConfirmation,

    // Required fields
    validateRequiredFields,
    isNotEmpty,

    // Auth
    validateAuthCredentials,

    // Forms
    validateForm,
};

