import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { isValidUUID } from '@/lib/uuid-validation';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

type AuthResult =
    | { error: NextResponse }
    | { user: { user_id: string }; id: string };

async function authenticate(params: Promise<{ id: string }>): Promise<AuthResult> {
    const user = await validateSession();
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const { id } = await params;
    if (!isValidUUID(id)) return { error: NextResponse.json({ error: 'Invalid session id' }, { status: 400 }) };
    return { user: user as { user_id: string }, id };
}

// GET /api/chat/sessions/:id — fetch all messages for a session
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticate(params);
        if ('error' in auth) return auth.error;
        const { user, id } = auth;

        const sessions = await sql`
            SELECT id, title, note_id, created_at, updated_at
            FROM app.chat_sessions
            WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
        `;
        if (sessions.length === 0) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const messages = await sql`
            SELECT id, role, content, sources, created_at
            FROM app.chat_messages
            WHERE session_id = ${id}::uuid
            ORDER BY created_at
        `;

        return NextResponse.json({ session: sessions[0], messages });
    } catch (error) {
        logger.error('chat session GET error', { error });
        return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }
}

// DELETE /api/chat/sessions/:id — delete a session and all its messages
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticate(params);
        if ('error' in auth) return auth.error;
        const { user, id } = auth;

        const deleted = await sql`
            DELETE FROM app.chat_sessions
            WHERE id = ${id}::uuid AND user_id = ${user.user_id}::uuid
            RETURNING id
        `;

        if (deleted.length === 0) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('chat session DELETE error', { error });
        return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
}
