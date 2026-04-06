// type declarations for auth.js — keeps validateSession typed across the codebase

export interface SessionUser {
  user_id: string;
  email: string;
}

export function validateSession(request?: unknown): Promise<SessionUser | null>;
export function getSessionCookie(): Promise<string | undefined>;
export function clearSessionCookie(): Promise<void>;
export function setSessionCookie(token: string): Promise<void>;
export function createJWTToken(payload: Record<string, unknown>): string;
export function verifyJWTToken(token: string): Record<string, unknown> | null;
export function createSuccessResponse(
  data: Record<string, unknown>,
  status?: number,
): Response;
export function createErrorResponse(
  message: string,
  status?: number,
  additionalData?: Record<string, unknown>,
): Response;
export function createValidationErrorResponse(errors: unknown[]): Response;
export function createAuthSession(
  user: { user_id: string; email: string },
  expiryDays?: number,
): Promise<Response>;
