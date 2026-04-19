import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import sql from "../src/database/pgsql.js";

const queueUrl = process.env.SQS_QUEUE_URL;
if (!queueUrl) {
  throw new Error("SQS_QUEUE_URL is required");
}

const sqs = new SQSClient({ region: process.env.AWS_REGION || "eu-west-1" });

// ── pending_retry: send as extract-retry (already have s3 buffer) ────────────

const pendingRows = await sql`
  SELECT
    ci.id AS import_id,
    ci.user_id,
    ci.note_id AS source_note_id,
    ci.filename,
    ci.mime_type,
    n.s3_key,
    t.parent_id
  FROM app.canvas_imports ci
  JOIN app.notes n ON n.note_id = ci.note_id
  JOIN app.tree_items t ON t.note_id = ci.note_id AND t.user_id = ci.user_id
  WHERE ci.status = 'pending_retry'
    AND ci.mime_type NOT LIKE 'text/%'
    AND n.deleted_at IS NULL
    AND n.s3_key IS NOT NULL
`;

console.log(`pending_retry items: ${pendingRows.length}`);

let sent = 0;

for (let i = 0; i < pendingRows.length; i += 10) {
  const batch = pendingRows.slice(i, i + 10).map((r, idx) => ({
    Id: String(idx),
    MessageBody: JSON.stringify({
      type: "extract-retry",
      noteId: r.source_note_id,
      userId: r.user_id,
      s3Key: r.s3_key,
      filename: r.filename,
      mimeType: r.mime_type,
      parentFolderId: r.parent_id,
      attempt: 0,
    }),
  }));

  const out = await sqs.send(
    new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: batch }),
  );
  sent += out.Successful?.length ?? 0;
  if ((out.Failed?.length ?? 0) > 0) console.warn(`batch failures: ${out.Failed.length}`);
}

console.log(`queued extract-retry messages: ${sent}`);

// ── error: reset status + re-queue as canvas-file (re-downloads from Canvas) ─

const errorRows = await sql`
  SELECT ci.id, ci.user_id, ci.job_id
  FROM app.canvas_imports ci
  WHERE ci.status = 'error'
    AND ci.error_message ILIKE '%marker%'
`;

console.log(`error (marker) items: ${errorRows.length}`);

if (errorRows.length > 0) {
  const ids = errorRows.map((r) => r.id);

  // reset to downloading so processCanvasFile won't skip them
  await sql`
    UPDATE app.canvas_imports
    SET status = 'downloading', error_message = NULL, updated_at = NOW()
    WHERE id = ANY(${sql.array(ids, 'uuid')}::uuid[])
  `;

  let errorSent = 0;
  for (let i = 0; i < errorRows.length; i += 10) {
    const batch = errorRows.slice(i, i + 10).map((r, idx) => ({
      Id: String(idx),
      MessageBody: JSON.stringify({
        type: "canvas-file",
        importRecordId: r.id,
        jobId: r.job_id,
        userId: r.user_id,
      }),
    }));

    const out = await sqs.send(
      new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: batch }),
    );
    errorSent += out.Successful?.length ?? 0;
    if ((out.Failed?.length ?? 0) > 0) console.warn(`batch failures: ${out.Failed.length}`);
  }

  console.log(`queued canvas-file messages: ${errorSent}`);
}
