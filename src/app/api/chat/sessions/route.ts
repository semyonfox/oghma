import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

// GET /api/chat/sessions — list sessions, or resume the latest session for a note
export const GET = withErrorHandler(async (request: NextRequest) => {
    try {
        const user = await validateSession();
        if (!user) {
            return tracedError('Unauthorized', 401);
        }

        const noteId = request.nextUrl.searchParams.get('noteId');
        const resume = request.nextUrl.searchParams.get('resume');

        // resume mode: return the most recent session + messages
        if (noteId || resume === '1') {
            const [session] = noteId
                ? await sql`
                    SELECT id FROM app.chat_sessions
                    WHERE user_id = ${user.user_id}::uuid AND note_id = ${noteId}::uuid
                    ORDER BY updated_at DESC
                    LIMIT 1
                `
                : await sql`
                    SELECT id FROM app.chat_sessions
                    WHERE user_id = ${user.user_id}::uuid
                    ORDER BY updated_at DESC
                    LIMIT 1
                `;
            if (!session) {
                return NextResponse.json({ sessionId: null, messages: [] });
            }

            const messages = await sql`
                SELECT role, content, sources, created_at
                FROM app.chat_messages
                WHERE session_id = ${session.id}::uuid
                ORDER BY created_at
                LIMIT 50
            `;

            return NextResponse.json({
                sessionId: session.id,
                messages: messages.map((m: any) => ({
                    role: m.role,
                    content: m.content,
                    sources: m.sources ? (typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources) : [],
                    created_at: m.created_at,
                })),
            });
        }

        // default: list all sessions
        const sessions = await sql`
            SELECT s.id, s.title, s.note_id, s.created_at, s.updated_at,
                   COUNT(m.id)::int AS message_count
            FROM app.chat_sessions s
            LEFT JOIN app.chat_messages m ON m.session_id = s.id
            WHERE s.user_id = ${user.user_id}::uuid
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            LIMIT 100
        `;

        return NextResponse.json({ sessions });
    } catch (error) {
        logger.error('chat sessions GET error', { error });
        return tracedError('Failed to fetch sessions', 500);
    }
});
