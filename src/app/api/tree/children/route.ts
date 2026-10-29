import { NextResponse } from 'next/server';
import type postgres from "postgres";
import { withErrorHandler, requireAuth, requireValidId, ApiError } from '@/lib/api-error';
import sql from '@/database/pgsql';
import { readTopicMarks } from '@/lib/notes/storage/tree-topics';
import type { CanvasCourseStatus, CourseState } from '@/lib/notes/types/note';

const database = sql as postgres.Sql;

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
  bundlePdfId: string | null;
  bundleNoteId: string | null;
  updatedAt: Date | string | null;
  // only the root listing selects these, for its top-level folders
  isCanvasCourse?: boolean;
  canvasStatus?: string | null;
  courseOverride?: boolean | null;
  academicYear?: string | null;
}

const COURSE_STATUSES: readonly string[] = ['current', 'past', 'pending', 'inaccessible'];

function isCourseStatus(value: string | null | undefined): value is CanvasCourseStatus {
  return typeof value === 'string' && COURSE_STATUSES.includes(value);
}

function courseState(row: TreeChildRow): CourseState | undefined {
  if (!row.isFolder || row.isCanvasCourse === undefined) return undefined;
  const canvasStatus = isCourseStatus(row.canvasStatus) ? row.canvasStatus : null;
  return {
    canvasStatus,
    isCanvasCourse: row.isCanvasCourse === true,
    override: row.courseOverride ?? null,
    academicYear: row.academicYear ?? null,
  };
}

function isoTimestamp(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
 * Extraction puts each PDF in a folder named after it, next to the Markdown
 * extracted from it. When a folder holds exactly that pair (or only the PDF
 * while extraction runs), report it so the sidebar can show one document row
 * instead of a folder and two near-identical files. Anything else in the
 * folder, including a renamed companion, keeps it an ordinary folder.
 */
function documentBundleJoin() {
  return database`
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(c.note_id) FILTER (WHERE c.s3_key IS NOT NULL
          AND RIGHT(LOWER(c.title), 4) = '.pdf'
          AND LEFT(c.title, LENGTH(c.title) - 4) = n.title))[1] AS pdf_id,
        (array_agg(c.note_id ORDER BY c.updated_at DESC) FILTER (WHERE c.s3_key IS NULL
          AND NOT c.is_folder
          AND c.title = n.title || '.md'))[1] AS note_id
      FROM app.tree_items ct
      JOIN app.notes c ON c.note_id = ct.note_id AND c.user_id = ct.user_id
      WHERE n.is_folder
        AND ct.user_id = ti.user_id
        AND ct.parent_id = ti.note_id
        AND c.deleted_at IS NULL
      HAVING COUNT(*) FILTER (WHERE c.s3_key IS NOT NULL
          AND RIGHT(LOWER(c.title), 4) = '.pdf'
          AND LEFT(c.title, LENGTH(c.title) - 4) = n.title) = 1
        AND COUNT(*) = 1 + COUNT(*) FILTER (WHERE c.s3_key IS NULL AND NOT c.is_folder
          AND c.title = n.title || '.md')
        AND COUNT(*) <= 2
    ) bundle ON true
  `;
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
    const rawParentId = url.searchParams.get('parent_id');
    const parentId = rawParentId ? requireValidId(rawParentId, 'parent_id') : null;

    // a trashed or foreign folder is a 404, never an empty branch: the client
    // treats an empty snapshot as "this folder has no children"
    if (parentId) {
      const parents = await database<{ note_id: string }[]>`
        SELECT note_id
        FROM app.notes
        WHERE note_id = ${parentId}::uuid
          AND user_id = ${user.user_id}::uuid
          AND is_folder = TRUE
          AND deleted_at IS NULL
        LIMIT 1
      `;
      if (parents.length === 0) {
        throw new ApiError(404, "Parent folder not found");
      }
    }

    // Fetch children, then apply natural title ordering so "Week 2" comes
    // before "Week 10". PostgreSQL's default text ordering is lexical.
    // Uses app.tree_items for hierarchy and app.notes for metadata.
    // Split into two queries because postgres tagged templates always
    // parameterise interpolated values — you cannot embed raw SQL like
    // "IS NULL" or "= $2::uuid" in the same template branch.
    const rows = parentId
      ? await database<TreeChildRow[]>`
          SELECT
            ti.note_id as id,
            n.title,
            n.is_folder as "isFolder",
            ti.is_expanded as "isExpanded",
            n.s3_key as "s3Key",
            (SELECT a.mime_type FROM app.attachments a
             WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
             LIMIT 1) as "mimeType",
            n.pinned,
            bundle.pdf_id as "bundlePdfId",
            bundle.note_id as "bundleNoteId",
            n.updated_at as "updatedAt"
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          ${documentBundleJoin()}
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id = ${parentId}::uuid
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `
      : await database<TreeChildRow[]>`
          SELECT
            ti.note_id as id,
            n.title,
            n.is_folder as "isFolder",
            ti.is_expanded as "isExpanded",
            n.s3_key as "s3Key",
            (SELECT a.mime_type FROM app.attachments a
             WHERE a.note_id = n.note_id AND a.user_id = n.user_id AND a.s3_key = n.s3_key
             LIMIT 1) as "mimeType",
            n.pinned,
            bundle.pdf_id as "bundlePdfId",
            bundle.note_id as "bundleNoteId",
            n.updated_at as "updatedAt",
            (n.canvas_course_id IS NOT NULL AND n.canvas_module_id IS NULL
              AND n.canvas_assignment_id IS NULL) as "isCanvasCourse",
            course.status as "canvasStatus",
            n.course_finished_override as "courseOverride",
            n.canvas_academic_year as "academicYear"
          FROM app.tree_items ti
          JOIN app.notes n ON ti.note_id = n.note_id
          ${documentBundleJoin()}
          LEFT JOIN app.canvas_course_status course
            ON course.user_id = n.user_id
           AND course.canvas_course_id = n.canvas_course_id
           AND n.is_folder
           AND n.canvas_module_id IS NULL
           AND n.canvas_assignment_id IS NULL
          WHERE ti.user_id = ${user.user_id}::uuid
            AND ti.parent_id IS NULL
            AND n.deleted_at IS NULL
          ORDER BY n.title ASC
        `;

    // a document bundle is marked by its PDF, which pairs with its note below
    const markIds = rows.flatMap((row) =>
      row.bundlePdfId ? [row.bundlePdfId] : row.isFolder ? [] : [row.id],
    );
    const marks = await readTopicMarks(user.user_id, markIds);

    const body = {
      parentId: parentId || 'root',
      items: sortTreeChildren(
        rows.map((row) => {
          const updatedAt = isoTimestamp(row.updatedAt);
          const topics = marks.get(row.bundlePdfId ?? row.id);
          const course = courseState(row);
          return {
            id: row.id,
            title: row.title,
            isFolder: row.isFolder,
            isExpanded: row.isExpanded,
            s3Key: row.s3Key || null,
            mimeType: row.mimeType || null,
            pinned: row.pinned ?? 0,
            ...(row.bundlePdfId
              ? { bundle: { pdfId: row.bundlePdfId, noteId: row.bundleNoteId } }
              : {}),
            ...(updatedAt ? { updatedAt } : {}),
            ...(topics ? { topics } : {}),
            ...(course ? { course } : {}),
          };
        }),
      ),
    };

    return NextResponse.json(body);
});
