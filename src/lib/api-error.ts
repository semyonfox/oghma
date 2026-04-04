import { NextRequest, NextResponse } from 'next/server';
import logger from './logger';
import { getTraceId, withTrace } from './trace';
import { validateSession } from './auth';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public userMessage: string,
    public internalDetails?: string,
  ) {
    super(userMessage);
    this.name = 'ApiError';
  }
}

function extractErrorInfo(error: unknown) {
  if (error instanceof ApiError) {
    return {
      userMessage: error.userMessage,
      statusCode: error.statusCode,
      logMeta: { statusCode: error.statusCode, internal: error.internalDetails },
    };
  }
  const raw = error instanceof Error ? error.message : String(error);
  return {
    userMessage: 'Internal server error',
    statusCode: 500,
    logMeta: { message: raw, stack: (error as Error)?.stack },
  };
}

export function apiErrorResponse(error: unknown): NextResponse {
  const { userMessage, statusCode, logMeta } = extractErrorInfo(error);
  logger.error(userMessage, logMeta);
  return NextResponse.json({ error: userMessage, traceId: getTraceId() }, { status: statusCode });
}

// traced error response for manual returns within a withErrorHandler route
export function tracedError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message, traceId: getTraceId() }, { status });
}

type AuthUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

export async function requireAuth(): Promise<AuthUser> {
  const user = await validateSession();
  if (!user) throw new ApiError(401, "Unauthorized");
  return user as AuthUser;
}

type RouteHandler = (request: NextRequest, context?: any) => Promise<NextResponse>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return (request, context) =>
    withTrace(async () => {
      try { return await handler(request, context); }
      catch (error) { return apiErrorResponse(error); }
    });
}
