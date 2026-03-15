import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

/**
 * GET /api/tree/children?parent_id=<uuid>
 * 
 * Fetch children of a folder (or root if parent_id not provided).
 * Sorted A-Z by title.
 * 
 * @param parent_id - UUID of parent note, or null for root
 * @returns Array of children with title, is_folder, is_expanded
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

    const url = new URL(request.url);
    const parentId = url.searchParams.get('parent_id');

    // Validate parent_id format if provided
    if (parentId && !/^[0-9a-f-]+$/i.test(parentId)) {
      return NextResponse.json(
        { error: 'Invalid parent_id format' },
        { status: 400 }
      );
    }

    // Fetch children, sorted A-Z by title
    const rows = await sql`
      SELECT 
        ti.note_id,
        n.title,
        n.is_folder,
        ti.is_expanded
      FROM app.tree_items ti
      JOIN app.notes n ON ti.note_id = n.note_id
      WHERE ti.user_id = ${user.user_id}::uuid
        AND ti.parent_id IS ${parentId ? `${parentId}::uuid` : 'NULL'}
        AND n.deleted = 0 
        AND n.deleted_at IS NULL
      ORDER BY n.title ASC
    `;

    return NextResponse.json({
      parentId: parentId || 'root',
      items: rows.map(row => ({
        id: row.note_id,
        title: row.title,
        isFolder: row.is_folder,
        isExpanded: row.is_expanded,
      })),
    });
  } catch (error) {
    console.error('Tree children fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch children' },
      { status: 500 }
    );
  }
}
