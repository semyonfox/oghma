const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: unknown = null,
  ) {
    super(message);
    this.name = "APIError";
  }
}

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
  } catch {
    return { error: `Request failed with status ${response.status}` };
  }
}

async function postJson<T>(url: string, data: unknown): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const rawErrorData = await parseErrorResponse(response);
      const parsedError = errorPayload(rawErrorData);
      throw new APIError(
        parsedError.error || `Request failed with status ${response.status}`,
        response.status,
        rawErrorData,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof APIError) throw error;

    if (error instanceof TypeError) {
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

export function login(
  email: string,
  password: string,
  rememberMe = false,
): Promise<LoginResponse> {
  return postJson<LoginResponse>("/api/auth/login", {
    email,
    password,
    rememberMe,
  });
}

export function register(
  email: string,
  password: string,
  marketing?: unknown,
  agentRegistration?: AgentRegistrationClaim,
): Promise<RegisterResponse> {
  return postJson<RegisterResponse>("/api/auth/register", {
    email,
    password,
    marketing,
    ...agentRegistration,
  });
}

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
