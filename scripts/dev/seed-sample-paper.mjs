#!/usr/bin/env node

// seeds a real scientific paper (PDF) + a markdown note about it into the mock DB,
// uploads both files to the mock storage bucket, chunks the PDF text and embeds the
// chunks through the fake-ai provider so semantic AND keyword search both return it.
//
// run via run-mock.mjs so the .env.mock values are loaded:
//   node scripts/dev/run-mock.mjs node scripts/dev/seed-sample-paper.mjs
//
// idempotent — fixed UUIDs, ON CONFLICT upserts. only touches the seeded mock user.

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { deleteChunkVectors, upsertChunkVectors } from "../../src/lib/qdrant.ts";

const FIXTURES = resolve(process.cwd(), "scripts/e2e/fixtures");
const userId = process.env.E2E_SEED_USER_ID || "11111111-1111-4111-8111-111111111111";

// stable ids so re-running just upserts
const pdfNoteId = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const mdNoteId = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[paper] DATABASE_URL missing — run through scripts/dev/run-mock.mjs");
  process.exit(1);
}

// mirror StoreProvider: prefix has its trailing slash normalized so it always ends in "/"
// (see src/lib/storage/base.ts constructor) — must match or the app reads the wrong key
const rawPrefix = process.env.STORAGE_PREFIX || "oghma";
const storagePrefix = rawPrefix ? `${rawPrefix.replace(/\/$/, "")}/` : "";
const fullKey = (path) => `${storagePrefix}${path}`;

const s3 = new S3Client({
  region: process.env.STORAGE_REGION || "us-east-1",
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: process.env.STORAGE_PATH_STYLE === "true",
  credentials:
    process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY
      ? {
          accessKeyId: process.env.STORAGE_ACCESS_KEY,
          secretAccessKey: process.env.STORAGE_SECRET_KEY,
        }
      : undefined,
});

async function putObject(storagePath, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: fullKey(storagePath),
      Body: body,
      ContentType: contentType,
    }),
  );
}

// split plain text into ~800-char chunks on paragraph/sentence boundaries
function chunkText(text, target = 800) {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > target && buf) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 40);
}

// embed through the fake-ai provider so query vectors and stored vectors match
async function embed(text) {
  const base = process.env.EMBEDDING_API_URL;
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.EMBEDDING_API_KEY || "mock"}`,
    },
    body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || "e2e-embedding", input: text }),
  });
  if (!res.ok) throw new Error(`embedding failed: ${res.status}`);
  const json = await res.json();
  return json.data[0].embedding;
}

async function main() {
  const pdfBuffer = readFileSync(resolve(FIXTURES, "sample-paper.pdf"));
  const pdfText = readFileSync(resolve(FIXTURES, "sample-paper.txt"), "utf8");
  const mdText = readFileSync(resolve(FIXTURES, "sample-paper.md"), "utf8");

  const pdfFilename = "attention-is-all-you-need.pdf";
  const mdFilename = "attention-notes.md";
  const pdfKey = `notes/${pdfNoteId}/${pdfFilename}`;
  const mdKey = `notes/${mdNoteId}/${mdFilename}`;

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  try {
    // attachments has no unique constraint, so clear prior rows to stay idempotent
    await sql`DELETE FROM app.attachments WHERE note_id IN (${pdfNoteId}::uuid, ${mdNoteId}::uuid)`;

    // 1. upload both files to the mock bucket
    await putObject(pdfKey, pdfBuffer, "application/pdf");
    await putObject(mdKey, Buffer.from(mdText, "utf8"), "text/markdown");
    console.log(`[paper] uploaded ${fullKey(pdfKey)} and ${fullKey(mdKey)}`);

    // 2. PDF file note (extracted_text powers keyword search on the note)
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, extracted_text, s3_key, is_folder, created_at, updated_at)
      VALUES (${pdfNoteId}::uuid, ${userId}::uuid, 'Attention Is All You Need (sample paper)',
              '', ${pdfText}, ${pdfKey}, false, NOW(), NOW())
      ON CONFLICT (note_id) DO UPDATE
        SET extracted_text = EXCLUDED.extracted_text, s3_key = EXCLUDED.s3_key,
            deleted_at = NULL, updated_at = NOW()
    `;
    await sql`
      INSERT INTO app.attachments (note_id, user_id, filename, s3_key, mime_type, file_size)
      VALUES (${pdfNoteId}::uuid, ${userId}::uuid, ${pdfFilename}, ${pdfKey}, 'application/pdf', ${pdfBuffer.length})
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO app.tree_items (id, user_id, note_id, parent_id)
      VALUES (gen_random_uuid(), ${userId}::uuid, ${pdfNoteId}::uuid, NULL)
      ON CONFLICT (user_id, note_id) DO NOTHING
    `;

    // 3. markdown note about the paper
    await sql`
      INSERT INTO app.notes (note_id, user_id, title, content, s3_key, is_folder, created_at, updated_at)
      VALUES (${mdNoteId}::uuid, ${userId}::uuid, 'Notes on Attention Is All You Need',
              ${mdText}, ${mdKey}, false, NOW(), NOW())
      ON CONFLICT (note_id) DO UPDATE
        SET content = EXCLUDED.content, s3_key = EXCLUDED.s3_key,
            deleted_at = NULL, updated_at = NOW()
    `;
    await sql`
      INSERT INTO app.attachments (note_id, user_id, filename, s3_key, mime_type, file_size)
      VALUES (${mdNoteId}::uuid, ${userId}::uuid, ${mdFilename}, ${mdKey}, 'text/markdown', ${Buffer.byteLength(mdText)})
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO app.tree_items (id, user_id, note_id, parent_id)
      VALUES (gen_random_uuid(), ${userId}::uuid, ${mdNoteId}::uuid, NULL)
      ON CONFLICT (user_id, note_id) DO NOTHING
    `;

    // 4. chunk the PDF text and embed each chunk for semantic search
    const oldChunkRows = await sql`SELECT id FROM app.chunks WHERE document_id = ${pdfNoteId}::uuid`;
    await deleteChunkVectors(oldChunkRows.map((row) => row.id)).catch(() => undefined);
    await sql`DELETE FROM app.chunks WHERE document_id = ${pdfNoteId}::uuid`;

    const chunks = chunkText(pdfText);
    let i = 0;
    for (const text of chunks) {
      const vector = await embed(text);
      const [{ id: chunkId }] = await sql`
        INSERT INTO app.chunks (document_id, user_id, text, section)
        VALUES (${pdfNoteId}::uuid, ${userId}::uuid, ${text}, ${`chunk ${i + 1}`})
        RETURNING id
      `;
      await upsertChunkVectors([{
        chunkId,
        documentId: pdfNoteId,
        userId,
        vector,
      }]);
      i += 1;
    }

    console.log(`[paper] seeded ${chunks.length} chunks + embeddings for the PDF`);
    console.log("[paper] done — PDF + markdown note are searchable in the mock DB");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[paper] seed failed:", error.message);
  process.exit(1);
});
