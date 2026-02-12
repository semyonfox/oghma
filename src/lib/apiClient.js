/**
 * API Client Wrapper
 * Provides a centralized fetch wrapper with error handling, authentication, and retry logic
 */

/**
 * API Client Configuration
 */
const API_CONFIG = {
    baseURL: process.env.NEXT_PUBLIC_API_URL || '',
    timeout: 10000, // 10 seconds
    retries: 0, // Number of retries for failed requests
};

/**
 * Custom API Error class
 */
export class APIError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

/**
 * Parse error response from API
 * @param {Response} response - Fetch response object
 * @returns {Promise<Object>} - Parsed error data
 */
async function parseErrorResponse(response) {
    try {
        return await response.json();
    } catch (parseErr) {
        // If response isn't JSON, return generic error
        return { error: `Request failed with status ${response.status}` };
    }
}

/**
 * Core fetch wrapper with error handling
 * @param {string} url - API endpoint (relative or absolute)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Response data
 * @throws {APIError} - On request failure
 */
async function apiRequest(url, options = {}) {
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    // Add credentials for cookie-based auth
    if (options.credentials !== false) {
        config.credentials = 'include';
    }

    // Build full URL
    const fullURL = url.startsWith('http') ? url : `${API_CONFIG.baseURL}${url}`;

    try {
        const response = await fetch(fullURL, config);

        // Handle non-OK responses
        if (!response.ok) {
            const errorData = await parseErrorResponse(response);
            throw new APIError(
                errorData.error || `Request failed with status ${response.status}`,
                response.status,
                errorData
            );
        }

        // Parse successful response
        return await response.json();

    } catch (error) {
        // Re-throw APIError as-is
        if (error instanceof APIError) {
            throw error;
        }

        // Handle network errors
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            throw new APIError('No server response. Please check your connection.', 0);
        }

        // Handle timeout errors
        if (error.name === 'AbortError') {
            throw new APIError('Request timeout', 408);
        }

        // Handle other errors
        throw new APIError(error.message || 'An unexpected error occurred', 500);
    }
}

/**
 * GET request
 * @param {string} url - API endpoint
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Response data
 */
export async function apiGet(url, options = {}) {
    return apiRequest(url, {
        ...options,
        method: 'GET',
    });
}

/**
 * POST request
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Response data
 */
export async function apiPost(url, data = null, options = {}) {
    return apiRequest(url, {
        ...options,
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * PUT request
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Response data
 */
export async function apiPut(url, data = null, options = {}) {
    return apiRequest(url, {
        ...options,
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * PATCH request
 * @param {string} url - API endpoint
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Response data
 */
export async function apiPatch(url, data = null, options = {}) {
    return apiRequest(url, {
        ...options,
        method: 'PATCH',
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * DELETE request
 * @param {string} url - API endpoint
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Response data
 */
export async function apiDelete(url, options = {}) {
    return apiRequest(url, {
        ...options,
        method: 'DELETE',
    });
}

// ============================================================
// AUTHENTICATION-SPECIFIC API CALLS
// ============================================================

/**
 * login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - User data and success status
 */
export async function login(email, password) {
    return apiPost('/api/auth/login', { email, password });
}

/**
 * register new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - User data and success status
 */
export async function register(email, password) {
    return apiPost('/api/auth/register', { email, password });
}

/**
 * Logout user
 * @returns {Promise<Object>} - Logout confirmation
 */
export async function logout() {
    return apiPost('/api/auth/logout');
}

/**
 * Get current user profile
 * @returns {Promise<Object>} - User profile data
 */
export async function getCurrentUser() {
    return apiGet('/api/auth/me');
}

// ============================================================
// ERROR HANDLING HELPERS
// ============================================================

/**
 * Extract user-friendly error message from API error
 * @param {Error} error - Error object
 * @returns {string} - User-friendly error message
 */
export function getErrorMessage(error) {
    if (error instanceof APIError) {
        // Check for validation errors
        if (error.data?.validationErrors) {
            const validationErrors = error.data.validationErrors;
            const messages = Object.values(validationErrors);
            return messages.join('; ');
        }

        // Return error message
        return error.message;
    }

    // Fallback for non-API errors
    return error.message || 'An unexpected error occurred';
}

/**
 * Extract validation errors as an object
 * @param {Error} error - Error object
 * @returns {Object|null} - Validation errors object or null
 */
export function getValidationErrors(error) {
    if (error instanceof APIError && error.data?.validationErrors) {
        return error.data.validationErrors;
    }
    return null;
}

/**
 * Check if error is a specific HTTP status
 * @param {Error} error - Error object
 * @param {number} status - HTTP status code to check
 * @returns {boolean} - True if error matches status
 */
export function isErrorStatus(error, status) {
    return error instanceof APIError && error.status === status;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
    get: apiGet,
    post: apiPost,
    put: apiPut,
    patch: apiPatch,
    delete: apiDelete,
    login,
    register,
    logout,
    getCurrentUser,
    getErrorMessage,
    getValidationErrors,
    isErrorStatus,
};

