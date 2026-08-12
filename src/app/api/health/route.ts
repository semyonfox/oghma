import { NextResponse, type NextRequest } from 'next/server';
import sql from "@/database/pgsql";
import logger from '@/lib/logger';
import { ensureRedisReady } from '@/lib/redis';

/**
 * Health check endpoint for Docker and monitoring
 * GET /api/health
 */
interface DatabaseHealth {
    connected: boolean;
    latencyMs: number | null;
    loginTableExists: boolean;
    error: string | null;
    errorCode: string | null;
    databaseUrlPresent: boolean;
    databaseUrl: string | null;
}

interface HealthResponse {
    status: string;
    timestamp: string;
    service?: string;
    database?: DatabaseHealth;
    rateLimiter?: { redisReady: boolean; status: string };
}

function errorInfo(error: unknown): { message: string; code: string | null } {
    if (error instanceof Error) {
        const code = Reflect.get(error, "code");
        return {
            message: error.message,
            code: typeof code === "string" ? code : null,
        };
    }
    return { message: String(error), code: null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const start = Date.now();
        const dbUrl = process.env.DATABASE_URL || null;
        const redactedDbUrl = dbUrl ? dbUrl.replace(/:\w+@/, ':****@') : null;
        const dbStatus: DatabaseHealth = {
            connected: false,
            latencyMs: null,
            loginTableExists: false,
            error: null,
            errorCode: null,
            databaseUrlPresent: !!dbUrl,
            databaseUrl: redactedDbUrl
        };
        try {
            if (!dbUrl) throw new Error('DATABASE_URL env var missing');
            // Simple connectivity check
            await sql`SELECT 1;`;
            dbStatus.connected = true;
            dbStatus.latencyMs = Date.now() - start;
            // Check if login table exists
            const tableCheck = await sql<{ exists: string | null }[]>`SELECT to_regclass('app.login') AS exists;`;
            dbStatus.loginTableExists = !!tableCheck?.[0]?.exists;
        } catch (dbErr) {
            const info = errorInfo(dbErr);
            dbStatus.error = info.message;
            dbStatus.errorCode = info.code;
        }
        // This is a liveness check for the app/database, not a readiness gate
        // for Redis. Keep it 200 when the app can serve traffic, but surface a
        // degraded rate limiter so monitoring does not mistake per-process
        // fallback protection for distributed rate limiting.
        const rateLimiterReady = await ensureRedisReady();
        const healthy = dbStatus.connected;
        const response: HealthResponse = {
            status: healthy && rateLimiterReady ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
        };

        // only expose internals if caller provides the monitoring secret
        const monitorSecret = process.env.HEALTH_CHECK_SECRET;
        if (monitorSecret && request?.headers?.get('x-health-secret') === monitorSecret) {
            response.service = 'ct216-project';
            response.database = dbStatus;
            response.rateLimiter = {
                redisReady: rateLimiterReady,
                status: rateLimiterReady ? 'ok' : 'degraded',
            };
        }

        return NextResponse.json(response, { status: healthy ? 200 : 503 });
    } catch (error) {
        logger.error('health check error', { error });
        return NextResponse.json(
            {
                status: 'error',
                message: 'Health check failed',
            },
            {status: 503}
        );
    }
}
