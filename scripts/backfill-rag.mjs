import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import fs from "fs";
import path from "path";
import sql from "../src/database/pgsql.js";
import { embedChunks } from "../src/lib/embeddings.ts";

const BATCH_SIZE = 96;

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }

    break;
  }
}

async function backfillMissingEmbeddings() {
  const missing = await sql`
    SELECT c.id, c.text
    FROM app.chunks c
    LEFT JOIN app.embeddings e ON e.chunk_id = c.id
    WHERE e.chunk_id IS NULL
    ORDER BY c.created_at ASC
  `;

  console.log(`missing embeddings: ${missing.length}`);
  if (missing.length === 0) {
    return { inserted: 0, failed: 0 };
  }

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const texts = batch.map((row) => row.text ?? "");

    try {
      const vectors = await embedChunks(texts);
      if (vectors.length !== batch.length) {
        throw new Error(
          `vector count mismatch: expected ${batch.length}, got ${vectors.length}`,
        );
      }

      const ids = batch.map((row) => row.id);
      const vectorStrings = vectors.map((item) => JSON.stringify(item.vector));

      await sql`
        INSERT INTO app.embeddings (chunk_id, embedding)
        SELECT t.chunk_id, t.embedding::vector
        FROM UNNEST(
          ${ids}::uuid[],
          ${vectorStrings}::text[]
        ) AS t(chunk_id, embedding)
        WHERE NOT EXISTS (
          SELECT 1 FROM app.embeddings e WHERE e.chunk_id = t.chunk_id
        )
      `;

      inserted += batch.length;
      console.log(`embedded ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}`);
    } catch (error) {
      failed += batch.length;
      console.warn(
        `failed embedding batch starting at ${i}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { inserted, failed };
}

async function requeuePendingRetries() {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    console.warn("SQS_QUEUE_URL is missing, skipping pending_retry requeue");
    return { queued: 0, total: 0 };
  }

  const rows = await sql`
    SELECT
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

  console.log(`pending retries to enqueue: ${rows.length}`);
  if (rows.length === 0) {
    return { queued: 0, total: 0 };
  }

  const sqs = new SQSClient({ region: process.env.AWS_REGION || "eu-north-1" });
  let queued = 0;

  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10).map((row, index) => ({
      Id: String(index),
      MessageBody: JSON.stringify({
        type: "extract-retry",
        noteId: row.source_note_id,
        userId: row.user_id,
        s3Key: row.s3_key,
        filename: row.filename,
        mimeType: row.mime_type,
        parentFolderId: row.parent_id,
        attempt: 0,
      }),
    }));

    const out = await sqs.send(
      new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: batch }),
    );
    queued += out.Successful?.length ?? 0;

    if ((out.Failed?.length ?? 0) > 0) {
      console.warn(`failed to enqueue ${out.Failed.length} retry messages`);
    }
  }

  return { queued, total: rows.length };
}

async function main() {
  loadEnv();

  const embeddingSummary = await backfillMissingEmbeddings();
  const retrySummary = await requeuePendingRetries();

  console.log("--- backfill summary ---");
  console.log(JSON.stringify({ embeddingSummary, retrySummary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
