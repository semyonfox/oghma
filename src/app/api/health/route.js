import {NextResponse} from 'next/server';

/**
 * Health check endpoint for Docker and monitoring
 * GET /api/health
 */
export async function GET() {
    try {
        // You can add additional health checks here (e.g., database connectivity)
        return NextResponse.json(
            {
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'ct216-project',
            },
            {status: 200}
        );
    } catch (error) {
        return NextResponse.json(
            {
                status: 'error',
                message: error.message,
            },
            {status: 503}
        );
    }
}

