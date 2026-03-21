import {NextResponse} from 'next/server';
import sql from "@/database/pgsql.js";
import logger from '@/lib/logger';

/**
 * Health check endpoint for Docker and monitoring
 * GET /api/health
 */
export async function GET() {
    try {
        const start = Date.now();
        const dbUrl = process.env.DATABASE_URL || null;
        const redactedDbUrl = dbUrl ? dbUrl.replace(/:\w+@/, ':****@') : null;
        let dbStatus = {
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
            const tableCheck = await sql`SELECT to_regclass('app.login') AS exists;`;
            dbStatus.loginTableExists = !!tableCheck?.[0]?.exists;
        } catch (dbErr) {
            dbStatus.error = dbErr.message;
            dbStatus.errorCode = dbErr.code || null;
        }
        return NextResponse.json(
            {
                status: dbStatus.connected ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                service: 'ct216-project',
                database: dbStatus
            },
            {status: dbStatus.connected ? 200 : 503}
        );
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
