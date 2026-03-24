import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

// GET /api/chat/sessions — list the current user's chat sessions
export async function GET() {
    try {
        const user = await validateSession();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
        return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
}
