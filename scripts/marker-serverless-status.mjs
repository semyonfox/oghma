#!/usr/bin/env node

import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
});

function sanitize(message) {
  return String(message ?? "")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 240);
}

try {
  const [counts, outstanding, failures] = await Promise.all([
    sql`
      SELECT provider, status, COUNT(*)::integer AS count
      FROM app.marker_jobs
      GROUP BY provider, status
      ORDER BY provider, status
    `,
    sql`
      SELECT provider, status, COUNT(*)::integer AS count,
             ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))))::integer
               AS oldest_seconds,
             MAX(dispatch_attempts)::integer AS max_dispatch_attempts
      FROM app.marker_jobs
      WHERE status NOT IN ('completed', 'failed', 'invalid_result', 'cancelled')
      GROUP BY provider, status
      ORDER BY oldest_seconds DESC
    `,
    sql`
      SELECT LEFT(callback_id::text, 8) AS job,
             provider, status, dispatch_attempts, updated_at, error
      FROM app.marker_jobs
      WHERE status IN (
        'failed', 'invalid_result', 'dispatch_retry', 'enqueue_failed',
        'awaiting_result', 'completion_retry', 'completion_enqueue_failed',
        'failure_enqueue_failed'
      )
      ORDER BY updated_at DESC
      LIMIT 20
    `,
  ]);

  console.log("Marker jobs by provider/status");
  console.table(counts);
  console.log("Outstanding Marker work");
  console.table(outstanding);
  console.log("Recent failures/retries (identifiers shortened; URLs redacted)");
  console.table(
    failures.map((row) => ({
      ...row,
      error: sanitize(row.error),
    })),
  );
} finally {
  await sql.end();
}
