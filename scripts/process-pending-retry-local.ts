#!/usr/bin/env -S npx tsx
// TypeScript imports require tsx. Prefer:
//   npm run worker:retry-pending
//
// Republishes due Canvas extraction retries with their exact import row, job
// and retry sequence, then reports import status counts. The worker's own
// database poll does the same every 30 seconds; this is the manual and deploy
// time version. It never runs extraction inline and never edits row status, so
// it cannot bypass the claim checks a retry delivery goes through.

import sql from "../src/database/pgsql.ts";
import { closeQueues } from "../src/lib/queue.ts";
import { recoverPendingExtractionRetries } from "../src/lib/canvas/import-extraction.ts";

interface StatusCountRow {
  status: string;
  count: number | string;
}

const BATCH_SIZE = 50;
const MAX_BATCHES = 20;

let exitCode = 0;
try {
  let republished = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const enqueued = await recoverPendingExtractionRetries(BATCH_SIZE);
    republished += enqueued;
    if (enqueued < BATCH_SIZE) break;
  }
  console.log(`republished due extraction retries: ${republished}`);

  const statusCounts = await sql<StatusCountRow[]>`
    SELECT status, COUNT(*) AS count
    FROM app.canvas_imports
    GROUP BY status
    ORDER BY status
  `;
  console.log("canvas import status counts:");
  for (const row of statusCounts) {
    console.log(`${row.status}: ${row.count}`);
  }
} catch (error: unknown) {
  console.error("retry republication failed:", error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await closeQueues();
  await sql.end({ timeout: 5 });
}
process.exit(exitCode);
