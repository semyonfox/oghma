// Tree rebuild endpoint
// Scans for orphaned notes and adds them to the tree root
import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { rebuildOrphanedNotes, getOrphanedNotes } from '@/lib/notes/storage/pg-tree.js';

/**
 * POST /api/tree/rebuild
 * Rebuilds user's tree by finding orphaned notes and adding them to root
 * Returns count of notes that were orphaned and reattached
 */
export async function POST(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get orphaned notes before rebuild
    const orphaned = await getOrphanedNotes(user.user_id);
    const orphanedCount = orphaned.length;

    // Rebuild tree (add orphaned notes to root)
    await rebuildOrphanedNotes(user.user_id);

    return NextResponse.json({
      success: true,
      message: `Rebuild complete: ${orphanedCount} note${orphanedCount !== 1 ? 's' : ''} reattached to root`,
      orphanedNotesReattached: orphanedCount,
      orphanedNoteIds: orphaned,
    });
  } catch (error) {
    console.error('Tree rebuild error:', error);
    return NextResponse.json(
      { error: 'Failed to rebuild tree' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tree/rebuild
 * Check status - returns count of orphaned notes without rebuilding
 */
export async function GET(request) {
  try {
    // Get authenticated user
    const user = await validateSession();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get orphaned notes
    const orphaned = await getOrphanedNotes(user.user_id);

    return NextResponse.json({
      success: true,
      status: orphaned.length === 0 ? 'healthy' : 'has_orphaned_notes',
      orphanedNotesCount: orphaned.length,
      orphanedNoteIds: orphaned,
    });
  } catch (error) {
    console.error('Tree status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check tree status' },
      { status: 500 }
    );
  }
}
