import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth.js';
import { cacheGet, cacheSet, cacheKeys } from '@/lib/cache';
import sql from '@/database/pgsql.js';
import logger from '@/lib/logger';
const database = sql as any;

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

    const key = cacheKeys.treeChildren(user.user_id, parentId);
    const cached = await cacheGet(key);
    if (cached) return NextResponse.json(cached);

    // Fetch children, sorted A-Z by title.
    // Uses app.tree_items for hierarchy and app.notes for metadata.
    // Split into two queries because postgres tagged templates always
    // parameterise interpolated values — you cannot embed raw SQL like
    // "IS NULL" or "= $2::uuid" in the same template branch.
    const rows = parentId
      ? await database`
          SELECT
            ti.note_id as id,
            n.title,
            n.is_folder as "isFolder",
            ti.is_expanded as "isExpanded",
            n.s3_key as "s3Key"
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id = ${parentId}::uuid
            AND n.deleted = 0
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `
      : await database`
          SELECT
            ti.note_id as id,
            n.title,
            n.is_folder as "isFolder",
            ti.is_expanded as "isExpanded",
            n.s3_key as "s3Key"
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id IS NULL
            AND n.deleted = 0
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `;

    const body = {
      parentId: parentId || 'root',
      items: rows.map((row: { id: string; title: string; isFolder: boolean; isExpanded: boolean; s3Key: string | null }) => ({
        id: row.id,
        title: row.title,
        isFolder: row.isFolder,
        isExpanded: row.isExpanded,
        s3Key: row.s3Key || null,
      })),
    };

    await cacheSet(key, body, 300);
    return NextResponse.json(body);
  } catch (error) {
    logger.error('tree children fetch error', { error });
    return NextResponse.json(
      { error: 'Failed to fetch children' },
      { status: 500 }
    );
  }
}
