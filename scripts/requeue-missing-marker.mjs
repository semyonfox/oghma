import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import sql from "../src/database/pgsql.js";

const queueUrl = process.env.SQS_QUEUE_URL;
if (!queueUrl) {
  throw new Error("SQS_QUEUE_URL is required");
}

const rows = await sql`
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
    AND n.deleted = 0
    AND n.s3_key IS NOT NULL
`;

console.log(`pending marker backfill items: ${rows.length}`);

const sqs = new SQSClient({ region: process.env.AWS_REGION || "eu-north-1" });

let sent = 0;
for (let i = 0; i < rows.length; i += 10) {
  const batch = rows.slice(i, i + 10).map((r, idx) => ({
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
    new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: batch,
    }),
  );

  sent += out.Successful?.length ?? 0;
  if ((out.Failed?.length ?? 0) > 0) {
    console.warn(`batch failures: ${out.Failed.length}`);
  }
}

console.log(`queued extract-retry messages: ${sent}`);
