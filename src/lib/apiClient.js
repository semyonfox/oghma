// centralized fetch wrapper with error handling and auth

const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 10000,
  retries: 0,
};

export class APIError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

async function parseErrorResponse(response) {
  try {
    return await response.json();
  } catch (_parseErr) {
    return { error: `Request failed with status ${response.status}` };
  }
}

async function apiRequest(url, options = {}) {
  const config = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  if (options.credentials !== false) {
    config.credentials = "include";
  }

  const fullURL = url.startsWith("http") ? url : `${API_CONFIG.baseURL}${url}`;

  try {
    const response = await fetch(fullURL, config);

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      throw new APIError(
        errorData.error || `Request failed with status ${response.status}`,
        response.status,
        errorData,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    if (error.name === "TypeError" && error.message === "Failed to fetch") {
      throw new APIError(
        "No server response. Please check your connection.",
        0,
      );
    }

    if (error.name === "AbortError") {
      throw new APIError("Request timeout", 408);
    }

    throw new APIError(error.message || "An unexpected error occurred", 500);
  }
}

export async function apiGet(url, options = {}) {
  return apiRequest(url, { ...options, method: "GET" });
}

export async function apiPost(url, data = null, options = {}) {
  return apiRequest(url, {
    ...options,
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut(url, data = null, options = {}) {
  return apiRequest(url, {
    ...options,
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPatch(url, data = null, options = {}) {
  return apiRequest(url, {
    ...options,
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiDelete(url, options = {}) {
  return apiRequest(url, { ...options, method: "DELETE" });
}

// auth-specific calls

export async function login(email, password, rememberMe = false) {
  return apiPost("/api/auth/login", { email, password, rememberMe });
}

export async function register(email, password) {
  return apiPost("/api/auth/register", { email, password });
}

export async function logout() {
  return apiPost("/api/auth/logout");
}

export async function getCurrentUser() {
  return apiGet("/api/auth/me");
}

// error helpers

export function getErrorMessage(error) {
  if (error instanceof APIError) {
    if (error.data?.validationErrors) {
      const messages = Object.values(error.data.validationErrors);
      return messages.join("; ");
    }
    return error.message;
  }
  return error.message || "An unexpected error occurred";
}

export function getValidationErrors(error) {
  if (error instanceof APIError && error.data?.validationErrors) {
    return error.data.validationErrors;
  }
  return null;
}

export function isErrorStatus(error, status) {
  return error instanceof APIError && error.status === status;
}

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
