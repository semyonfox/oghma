import { NextResponse } from 'next/server';
import sql from '@/database/pgsql.js';
import { syncS3ToPG } from '@/lib/notes/migrations/sync-s3-to-pg.js';

/**
 * POST /api/migrate/sync-all-s3
 * MIGRATION ENDPOINT: Syncs all users' notes from S3 to PostgreSQL
 * This should only be called once during migration
 */
export async function POST(request: Request) {
  try {
    // Simple auth: require a migration token in header
    const authHeader = request.headers.get('x-migration-token');
    const expectedToken = process.env.MIGRATION_TOKEN || 'migrate-now';
    
    if (authHeader !== expectedToken) {
      return NextResponse.json(
        { error: 'Invalid migration token' },
        { status: 401 }
      );
    }

    // Get all users from database
    const users = await sql`
      SELECT user_id, email FROM app.login
      ORDER BY created_at ASC
    `;

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users found to migrate',
        totalUsers: 0,
        results: [],
      });
    }

    // Sync notes for each user
    const results = [];
    for (const user of users) {
      try {
        const result = await syncS3ToPG(user.user_id);
        results.push({
          userId: user.user_id,
          email: user.email,
          ...result,
        });
      } catch (error) {
        results.push({
          userId: user.user_id,
          email: user.email,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        totalS3: acc.totalS3 + (r.totalInS3 || 0),
        totalSynced: acc.totalSynced + (r.synced || 0),
        totalAlready: acc.totalAlready + (r.alreadyInPG || 0),
        totalFailed: acc.totalFailed + (r.failed || 0),
      }),
      { totalS3: 0, totalSynced: 0, totalAlready: 0, totalFailed: 0 }
    );

    return NextResponse.json(
      {
        success: true,
        message: `Synced ${results.length} users: ${totals.totalSynced} notes synced, ${totals.totalAlready} already in database`,
        totalUsers: results.length,
        ...totals,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
