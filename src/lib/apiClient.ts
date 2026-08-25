// centralized fetch wrapper with error handling and auth

const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 10000,
  retries: 0,
};

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null,
  ) {
    super(message);
    this.name = "APIError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "credentials" | "headers"> & {
  credentials?: RequestCredentials | false;
  headers?: Record<string, string>;
};

type ValidationErrors = Record<string, string | string[]>;

interface ErrorPayload {
  error?: string;
  validationErrors?: ValidationErrors;
}

interface LoginResponse {
  success?: boolean;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
}

interface RegisterResponse {
  success?: boolean;
  requiresVerification: boolean;
  message?: string;
}

interface AgentRegistrationClaim {
  agentClaimToken: string;
  agentUserCode: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorPayload(value: unknown): ErrorPayload {
  if (!isRecord(value)) return {};
  return {
    error: typeof value.error === "string" ? value.error : undefined,
    validationErrors: isRecord(value.validationErrors)
      ? Object.fromEntries(
          Object.entries(value.validationErrors).filter(
            (entry): entry is [string, string | string[]] =>
              typeof entry[1] === "string" ||
              (Array.isArray(entry[1]) &&
                entry[1].every((item) => typeof item === "string")),
          ),
        )
      : undefined,
  };
}

async function parseErrorResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (_parseErr) {
    return { error: `Request failed with status ${response.status}` };
  }
}

async function apiRequest<T = unknown>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { credentials: _credentials, headers, ...requestOptions } = options;
  const config: RequestInit = {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (options.credentials === false) {
    delete config.credentials;
  } else {
    config.credentials = "include";
  }

  const fullURL = url.startsWith("http") ? url : `${API_CONFIG.baseURL}${url}`;

  try {
    const response = await fetch(fullURL, config);

    if (!response.ok) {
      const rawErrorData = await parseErrorResponse(response);
      const errorData = errorPayload(rawErrorData);
      throw new APIError(
        errorData.error || `Request failed with status ${response.status}`,
        response.status,
        rawErrorData,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new APIError(
        "No server response. Please check your connection.",
        0,
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new APIError("Request timeout", 408);
    }

    throw new APIError(
      error instanceof Error
        ? error.message || "An unexpected error occurred"
        : "An unexpected error occurred",
      500,
    );
  }
}

export async function apiGet<T = unknown>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(url, { ...options, method: "GET" });
}

export async function apiPost<T = unknown>(
  url: string,
  data: unknown = null,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut<T = unknown>(
  url: string,
  data: unknown = null,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPatch<T = unknown>(
  url: string,
  data: unknown = null,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiDelete<T = unknown>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>(url, { ...options, method: "DELETE" });
}

// auth-specific calls

export async function login(
  email: string,
  password: string,
  rememberMe = false,
): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/auth/login", {
    email,
    password,
    rememberMe,
  });
}

export async function register(
  email: string,
  password: string,
  marketing?: unknown,
  agentRegistration?: AgentRegistrationClaim,
): Promise<RegisterResponse> {
  return apiPost<RegisterResponse>("/api/auth/register", {
    email,
    password,
    marketing,
    ...agentRegistration,
  });
}

export async function logout(): Promise<unknown> {
  return apiPost("/api/auth/logout");
}

export async function getCurrentUser(): Promise<unknown> {
  return apiGet("/api/auth/me");
}

// error helpers

export function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const validationErrors = errorPayload(error.data).validationErrors;
    if (validationErrors) {
      return Object.values(validationErrors).flat().join("; ");
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message || "An unexpected error occurred"
    : "An unexpected error occurred";
}

export function getValidationErrors(error: unknown): ValidationErrors | null {
  if (error instanceof APIError) {
    return errorPayload(error.data).validationErrors ?? null;
  }
  return null;
}

export function isErrorStatus(error: unknown, status: number): boolean {
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
