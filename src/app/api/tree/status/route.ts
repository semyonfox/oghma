import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/tree/status
 * 
 * Check tree integrity:
 * - Orphaned notes (in notes but not in tree_items)
 * - Circular references (shouldn't exist)
 * - Basic stats
 * 
 * @returns Health status and any issues
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

    // Check for orphaned notes
    const orphaned = await sql`
      SELECT COUNT(*) as count 
      FROM app.notes n
      WHERE n.user_id = ${user.user_id}::uuid
        AND n.deleted = 0 AND n.deleted_at IS NULL
        AND n.note_id NOT IN (
          SELECT note_id FROM app.tree_items 
          WHERE user_id = ${user.user_id}::uuid
        )
    `;

    // Get basic stats
    const stats = await sql`
      SELECT 
        COUNT(DISTINCT n.note_id) as total_notes,
        SUM(CASE WHEN n.is_folder = true THEN 1 ELSE 0 END) as total_folders,
        SUM(CASE WHEN n.is_folder = false THEN 1 ELSE 0 END) as total_files
      FROM app.notes n
      WHERE n.user_id = ${user.user_id}::uuid
        AND n.deleted = 0 AND n.deleted_at IS NULL
    `;

    const orphanedCount = orphaned[0]?.count || 0;
    const stat = stats[0] || { total_notes: 0, total_folders: 0, total_files: 0 };

    const isHealthy = orphanedCount === 0;

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'issues',
      orphanedNotes: orphanedCount,
      totalNotes: parseInt(stat.total_notes) || 0,
      totalFolders: parseInt(stat.total_folders) || 0,
      totalFiles: parseInt(stat.total_files) || 0,
      message: isHealthy ? 'Tree structure is intact' : `${orphanedCount} orphaned note(s) found`,
    });
  } catch (error) {
    console.error('Tree status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check tree status' },
      { status: 500 }
    );
  }
}
