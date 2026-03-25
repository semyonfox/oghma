/**
 * Canvas folder deduplication and naming utilities.
 * Handles find-or-create semantics backed by partial unique indexes.
 */

import sql from '../../database/pgsql.js';
import { v4 as uuidv4 } from 'uuid';
import { addNoteToTree } from '../notes/storage/pg-tree.js';

// sentinel IDs for special Canvas structures
export const ASSIGNMENTS_PARENT_MODULE_ID = -1;
export const FORBIDDEN_SENTINEL_ID = 0;

// ── Folder naming ───────────────────────────────────────────────────────────

export function cleanCourseName(courseCode, courseName, term) {
  // extract year prefix from course code: "2526-CT2109" → year="2526", code="CT2109"
  const codeMatch = courseCode?.match(/^(\d{4})-?(.*)/);
  const cleanCode = codeMatch?.[2] || courseCode || '';
  let academicYear = codeMatch?.[1] || null;

  // fall back to enrollment term for year (e.g. "2025/2026" → "2526")
  if (!academicYear && term?.name) {
    const fullYears = term.name.match(/(\d{4})\D+(\d{4})/);
    if (fullYears) {
      academicYear = fullYears[1].slice(2) + fullYears[2].slice(2);
    } else {
      const shortYears = term.name.match(/(\d{4})\D+(\d{2})\b/);
      if (shortYears) academicYear = shortYears[1].slice(2) + shortYears[2];
    }
  }

  // strip duplicate code/prefix from course name
  let cleanName = courseName ?? '';
  if (courseCode && cleanName.startsWith(courseCode)) {
    cleanName = cleanName.slice(courseCode.length).trim();
  }
  if (cleanCode && cleanName.startsWith(cleanCode)) {
    cleanName = cleanName.slice(cleanCode.length).trim();
  }
  cleanName = cleanName.replace(/^[-—–:\s]+/, '').trim();

  // slugify: "Software Engineering 1" → "Software-Engineering-1"
  const slugged = cleanName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  const title = cleanCode && slugged
    ? `${cleanCode}-${slugged}`
    : cleanCode || slugged || 'Untitled-Course';

  return { title, academicYear };
}

// ── Folder deduplication ────────────────────────────────────────────────────

// single query handles all three folder types via conditional column matching
function findCanvasFolder(userId, canvas) {
  const { canvasCourseId, canvasModuleId, canvasAssignmentId } = canvas;
  const hasAssignment = canvasAssignmentId != null;
  const hasModule = canvasModuleId != null;
  return sql`
    SELECT note_id FROM app.notes
    WHERE user_id = ${userId}::uuid
      AND canvas_course_id = ${canvasCourseId}::int
      AND CASE
        WHEN ${hasAssignment} THEN canvas_assignment_id = ${canvasAssignmentId ?? 0}::int
        WHEN ${hasModule}     THEN canvas_module_id = ${canvasModuleId ?? 0}::int
        ELSE canvas_module_id IS NULL AND canvas_assignment_id IS NULL
      END
      AND is_folder = true AND deleted = 0
    LIMIT 1
  `;
}

async function reuseExisting(noteId, userId, parentId) {
  await addNoteToTree(userId, noteId, parentId ?? null);
  return noteId;
}

export async function findOrCreateFolder(userId, title, parentId, canvas = {}) {
  const { canvasCourseId, canvasAcademicYear } = canvas;

  // try to find existing folder by canvas IDs
  if (canvasCourseId != null) {
    const existing = await findCanvasFolder(userId, canvas);
    if (existing.length > 0) return reuseExisting(existing[0].note_id, userId, parentId);
  }

  const noteId = uuidv4();
  try {
    await sql`
      INSERT INTO app.notes (
        note_id, user_id, title, content, is_folder, deleted,
        canvas_course_id, canvas_module_id, canvas_assignment_id, canvas_academic_year,
        created_at, updated_at
      ) VALUES (
        ${noteId}::uuid, ${userId}::uuid, ${title}, '', true, 0,
        ${canvasCourseId ?? null}, ${canvas.canvasModuleId ?? null},
        ${canvas.canvasAssignmentId ?? null}, ${canvasAcademicYear ?? null},
        NOW(), NOW()
      )
    `;
    await addNoteToTree(userId, noteId, parentId ?? null);
    return noteId;
  } catch (err) {
    // unique index conflict — concurrent worker created it first
    if (err.code === '23505' && canvasCourseId != null) {
      const winner = await findCanvasFolder(userId, canvas);
      if (winner.length > 0) return reuseExisting(winner[0].note_id, userId, parentId);
    }
    console.warn(`Failed to create folder "${title}": ${err.message}`);
    return parentId;
  }
}

// ── HTML → text ─────────────────────────────────────────────────────────────

export function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '## ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, m => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>',
      '&quot;': '"', '&nbsp;': ' ', '&#39;': "'",
    })[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
