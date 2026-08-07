import { NextResponse } from 'next/server';
import { withErrorHandler, requireAuth, ApiError } from '@/lib/api-error';
import { cacheGet, cacheSet, cacheKeys } from '@/lib/cache';
import sql from '@/database/pgsql.js';
const database = sql as any;

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

interface TreeChildRow {
  id: string;
  title: string;
  isFolder: boolean;
  isExpanded: boolean;
  s3Key: string | null;
  mimeType: string | null;
  pinned: number;
}

function sortTreeChildren<T extends Pick<TreeChildRow, 'id' | 'title'>>(
  items: T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      titleCollator.compare(left.title, right.title) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * GET /api/tree/children?parent_id=<uuid>
 *
 * Fetch children of a folder (or root if parent_id not provided).
 * Sorted by title with numeric parts in natural order.
 *
 * @param parent_id - UUID of parent note, or null for root
 * @returns Array of children with title, is_folder, is_expanded
 */
export const GET = withErrorHandler(async (request) => {
    const user = await requireAuth();

    const url = new URL(request.url);
    const parentId = url.searchParams.get('parent_id');

    // validate parent_id format if provided
    if (parentId && !/^[0-9a-f-]+$/i.test(parentId)) {
      throw new ApiError(400, 'Invalid parent_id format');
    }

    const key = cacheKeys.treeChildren(user.user_id, parentId);
    const cached = await cacheGet<{
      parentId: string;
      items: TreeChildRow[];
    }>(key);
    if (cached) {
      return NextResponse.json({
        ...cached,
        items: sortTreeChildren(cached.items),
      });
    }

    // Fetch children, then apply natural title ordering so "Week 2" comes
    // before "Week 10". PostgreSQL's default text ordering is lexical.
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
            n.s3_key as "s3Key",
            (SELECT a.mime_type FROM app.attachments a
             WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
             LIMIT 1) as "mimeType",
            n.pinned
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id = ${parentId}::uuid
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `
      : await database`
          SELECT
            ti.note_id as id,
            n.title,
            n.is_folder as "isFolder",
            ti.is_expanded as "isExpanded",
            n.s3_key as "s3Key",
            (SELECT a.mime_type FROM app.attachments a
             WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
             LIMIT 1) as "mimeType",
            n.pinned
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id IS NULL
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `;

    const body = {
      parentId: parentId || 'root',
      items: sortTreeChildren(
        (rows as TreeChildRow[]).map((row) => ({
          id: row.id,
          title: row.title,
          isFolder: row.isFolder,
          isExpanded: row.isExpanded,
          s3Key: row.s3Key || null,
          mimeType: row.mimeType || null,
          pinned: row.pinned ?? 0,
        })),
      ),
    };

    await cacheSet(key, body, 300);
    return NextResponse.json(body);
});
