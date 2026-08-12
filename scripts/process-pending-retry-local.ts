#!/usr/bin/env -S npx tsx
// TypeScript imports require tsx. Prefer:
//   npm run worker:retry-pending

import sql from "../src/database/pgsql.ts";
import { processExtractionRetry } from "../src/lib/canvas/import-worker.ts";

interface PendingRetryRow {
  note_id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  s3_key: string | null;
  parent_id: string | null;
}

interface StatusCountRow {
  status: string;
  count: number | string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const targetStatus = process.env.CANVAS_IMPORT_STATUS ?? "pending_retry";

const rows = await sql<PendingRetryRow[]>`
  SELECT
    ci.note_id,
    ci.user_id,
    ci.filename,
    ci.mime_type,
    n.s3_key,
    ti.parent_id
  FROM app.canvas_imports ci
  JOIN app.notes n ON n.note_id = ci.note_id
  LEFT JOIN app.tree_items ti ON ti.user_id = ci.user_id AND ti.note_id = ci.note_id
  WHERE ci.status = ${targetStatus}
  ORDER BY ci.updated_at ASC
`;

console.log(`${targetStatus} rows: ${rows.length}`);

let done = 0;
let failed = 0;

for (const row of rows) {
  try {
    await processExtractionRetry({
      noteId: String(row.note_id),
      userId: String(row.user_id),
      s3Key: row.s3_key,
      filename: row.filename,
      mimeType: row.mime_type,
      parentFolderId: row.parent_id ? String(row.parent_id) : null,
      attempt: 1,
    });

    if (targetStatus !== "pending_retry") {
      await sql`
        UPDATE app.canvas_imports
        SET status = 'complete', error_message = NULL, updated_at = NOW()
        WHERE note_id = ${row.note_id}::uuid AND status = ${targetStatus}
      `;
    }

    done += 1;
  } catch (err: unknown) {
    failed += 1;
    console.error(`retry failed for note ${row.note_id}:`, errorMessage(err));
  }

  if ((done + failed) % 5 === 0) {
    console.log(`progress: ${done + failed}/${rows.length} (ok=${done}, fail=${failed})`);
  }
}

const statusCounts = await sql<StatusCountRow[]>`
  SELECT status, COUNT(*) AS count
  FROM app.canvas_imports
  GROUP BY status
  ORDER BY status
`;

console.log("final status counts:");
for (const row of statusCounts) {
  console.log(`${row.status}: ${row.count}`);
}

process.exit(failed > 0 ? 1 : 0);
