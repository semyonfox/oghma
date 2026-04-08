import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { isValidUUID } from '@/lib/utils/uuid';
import { withErrorHandler, tracedError } from '@/lib/api-error';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';

// PATCH /api/chat/sessions/:id/messages/:messageId — set thumbs up/down rating
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) => {
    try {
        const user = await validateSession();
        if (!user) return tracedError('Unauthorized', 401);

        const { id, messageId } = await params;
        if (!isValidUUID(id)) return tracedError('Invalid session id', 400);
        if (!isValidUUID(messageId)) return tracedError('Invalid message id', 400);

        const body = await req.json();
        const { rating } = body;

        if (rating !== 1 && rating !== -1 && rating !== null) {
            return tracedError('rating must be 1, -1, or null', 400);
        }

        const { user_id } = user as { user_id: string };

        const updated = await sql`
            UPDATE app.chat_messages m
            SET rating = ${rating}
            FROM app.chat_sessions s
            WHERE m.id = ${messageId}::uuid
              AND m.session_id = ${id}::uuid
              AND s.id = m.session_id
              AND s.user_id = ${user_id}::uuid
            RETURNING m.id
        `;

        if (updated.length === 0) {
            return tracedError('Message not found', 404);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('chat message PATCH error', { error });
        return tracedError('Failed to update rating', 500);
    }
});
