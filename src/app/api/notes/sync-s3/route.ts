import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { syncS3ToPG, checkSyncStatus } from '@/lib/notes/migrations/sync-s3-to-pg.js';

/**
 * GET /api/notes/sync-s3
 * Check sync status without making changes
 */
export async function GET(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const status = await checkSyncStatus(user.user_id);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Sync status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check sync status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes/sync-s3
 * Perform actual sync of missing notes from S3 to PostgreSQL
 */
export async function POST(request: Request) {
  try {
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await syncS3ToPG(user.user_id);
    
    if (result.success) {
      return NextResponse.json(
        {
          ...result,
          message: `Sync complete: ${result.synced} notes synced, ${result.alreadyInPG} already in database, ${result.failed} failed`,
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { ...result, error: 'Sync failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync notes' },
      { status: 500 }
    );
  }
}
