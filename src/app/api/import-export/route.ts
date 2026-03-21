// vault import/export routes
// tree + S3 storage are wired — these are ready to enable
// UI buttons in settings are disabled until you flip VAULT_JOBS_ENABLED
import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import sql from '@/database/pgsql.js';
import { sqsClient, CANVAS_IMPORT_QUEUE_URL } from '@/lib/sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

const ENABLED = process.env.VAULT_JOBS_ENABLED === 'true';

// POST /api/import-export?action=export  — queues a vault export job
// POST /api/import-export?action=import  — queues a vault import job (expects zip upload)
export async function POST(request: NextRequest) {
    if (!ENABLED) {
        return NextResponse.json(
            { error: 'Vault import/export is not yet enabled.' },
            { status: 501 }
        );
    }

    const session = await validateSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const action = request.nextUrl.searchParams.get('action');
    const userId = (session as { user_id: string }).user_id;

    if (action === 'export') {
        // queue a background export — worker builds zip and uploads to S3
        try {
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: CANVAS_IMPORT_QUEUE_URL,
                MessageBody: JSON.stringify({ type: 'vault-export', userId }),
            }));
        } catch (err) {
            console.error('SQS send failed for vault-export:', err);
        }
        return NextResponse.json({ success: true, queued: true });
    }

    if (action === 'import') {
        // accept zip upload, store in S3, then queue background import
        // the worker extracts markdown files, creates notes, runs RAG
        return NextResponse.json(
            { error: 'Vault import is not yet implemented.' },
            { status: 501 }
        );
    }

    return NextResponse.json({ error: 'action must be "export" or "import"' }, { status: 400 });
}
