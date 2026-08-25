#!/usr/bin/env -S npx tsx
// Direct sync script: syncs legacy S3 notes into PostgreSQL.
// Usage: npx tsx scripts/sync-s3-notes.ts

import postgres from "postgres";
import { getStorageProvider } from "../src/lib/storage/init.ts";

type SqlClient = ReturnType<typeof postgres>;

interface S3Note {
  id: string;
  title?: string | null;
  content?: string | null;
  deleted?: boolean | number;
  deleted_at?: string | null;
  shared?: number;
  pinned?: number;
  created_at?: string | null;
  updated_at?: string | null;
  pid?: string | null;
}

interface NoteIdRow {
  note_id: string;
}

interface UserRow {
  user_id: string;
  email: string;
}

interface PositionRow {
  max_pos: number | null;
}

interface SyncError {
  noteId: string;
  error: string;
}

interface SyncResult {
  success: boolean;
  totalInS3: number;
  alreadyInPG: number;
  synced: number;
  failed: number;
  errors: SyncError[];
}

interface UserSyncResult extends SyncResult {
  email: string;
  userId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOptionalString(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || value[key] === null || typeof value[key] === "string";
}

function hasOptionalNumber(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "number";
}

function isS3Note(value: unknown): value is S3Note {
  if (!isRecord(value) || typeof value.id !== "string") return false;

  return (
    hasOptionalString(value, "title") &&
    hasOptionalString(value, "content") &&
    (value.deleted === undefined ||
      typeof value.deleted === "boolean" ||
      typeof value.deleted === "number") &&
    hasOptionalString(value, "deleted_at") &&
    hasOptionalNumber(value, "shared") &&
    hasOptionalNumber(value, "pinned") &&
    hasOptionalString(value, "created_at") &&
    hasOptionalString(value, "updated_at") &&
    hasOptionalString(value, "pid")
  );
}

function parseS3Notes(indexJson: string): S3Note[] {
  const parsed: unknown = JSON.parse(indexJson);
  if (!isRecord(parsed) || !isRecord(parsed.notes)) return [];
  return Object.values(parsed.notes).filter(isS3Note);
}

async function getAllNotesFromS3(): Promise<S3Note[]> {
  try {
    const storage = getStorageProvider();
    const indexJson = await storage.getObject("notes/index.json");
    if (!indexJson) {
      console.log("Notes index not found in S3");
      return [];
    }
    return parseS3Notes(indexJson);
  } catch (error: unknown) {
    console.error("Error reading notes from S3:", error);
    return [];
  }
}

async function addNoteToTree(
  sql: SqlClient,
  userId: string,
  noteId: string,
  parentId: string | null,
): Promise<void> {
  try {
    const posResult = await sql<PositionRow[]>`
      SELECT COALESCE(MAX(position), 0) AS max_pos
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND parent_id IS ${parentId}
    `;

    const position = Number(posResult[0]?.max_pos ?? 0) + 1;

    await sql`
      INSERT INTO app.tree_items (user_id, note_id, parent_id, position)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId}, ${position})
      ON CONFLICT DO NOTHING
    `;
  } catch (error: unknown) {
    console.error(`Error adding note ${noteId} to tree:`, error);
  }
}

async function syncS3ToPG(
  sql: SqlClient,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    totalInS3: 0,
    alreadyInPG: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    const s3Notes = await getAllNotesFromS3();
    result.totalInS3 = s3Notes.length;

    if (s3Notes.length === 0) {
      result.success = true;
      return result;
    }

    const pgNotes = await sql<NoteIdRow[]>`
      SELECT note_id FROM app.notes
      WHERE user_id = ${userId}::uuid
    `;
    const pgNoteIds = new Set(pgNotes.map((note) => note.note_id));

    for (const s3Note of s3Notes) {
      try {
        const noteId = s3Note.id;
        if (pgNoteIds.has(noteId)) {
          result.alreadyInPG += 1;
          continue;
        }

        await sql`
          INSERT INTO app.notes (
            note_id,
            user_id,
            title,
            content,
            deleted,
            deleted_at,
            shared,
            pinned,
            created_at,
            updated_at
          )
          VALUES (
            ${noteId}::uuid,
            ${userId}::uuid,
            ${s3Note.title || "Untitled"},
            ${s3Note.content || ""},
            ${s3Note.deleted || 0},
            ${s3Note.deleted_at ? new Date(s3Note.deleted_at) : null},
            ${s3Note.shared || 0},
            ${s3Note.pinned || 0},
            ${s3Note.created_at ? new Date(s3Note.created_at) : new Date()},
            ${s3Note.updated_at ? new Date(s3Note.updated_at) : new Date()}
          )
          ON CONFLICT (note_id) DO NOTHING
        `;

        if (!s3Note.deleted) {
          await addNoteToTree(sql, userId, noteId, s3Note.pid || null);
        }

        result.synced += 1;
      } catch (error: unknown) {
        result.failed += 1;
        result.errors.push({ noteId: s3Note.id, error: errorMessage(error) });
        console.error(`Error syncing note ${s3Note.id}:`, error);
      }
    }

    result.success = true;
    return result;
  } catch (error: unknown) {
    console.error("Error in S3 to PG sync:", error);
    return result;
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("starting S3 to PostgreSQL sync...\n");
    const users = await sql<UserRow[]>`
      SELECT user_id, email FROM app.login
      ORDER BY created_at ASC
    `;

    if (users.length === 0) {
      console.log("no users found to migrate");
      return;
    }

    console.log(`Found ${users.length} user(s)\n`);

    const results: UserSyncResult[] = [];
    for (const user of users) {
      console.log(`Syncing notes for ${user.email} (${user.user_id})...`);
      const result = await syncS3ToPG(sql, user.user_id);
      results.push({ email: user.email, userId: user.user_id, ...result });

      if (result.success) {
        console.log(
          `  ✓ Synced: ${result.synced}, Already in PG: ${result.alreadyInPG}, Failed: ${result.failed}`,
        );
      } else {
        console.log("  ✗ Sync failed");
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("SYNC SUMMARY");
    console.log("=".repeat(60));

    const totals = results.reduce(
      (accumulator, result) => ({
        totalS3: accumulator.totalS3 + result.totalInS3,
        totalSynced: accumulator.totalSynced + result.synced,
        totalAlready: accumulator.totalAlready + result.alreadyInPG,
        totalFailed: accumulator.totalFailed + result.failed,
      }),
      { totalS3: 0, totalSynced: 0, totalAlready: 0, totalFailed: 0 },
    );

    console.log(`\nTotal notes in S3: ${totals.totalS3}`);
    console.log(`Synced to PostgreSQL: ${totals.totalSynced}`);
    console.log(`Already in PostgreSQL: ${totals.totalAlready}`);
    console.log(`Failed: ${totals.totalFailed}`);

    console.log("\nPer-user results:");
    for (const result of results) {
      const status = result.success ? "✓" : "✗";
      console.log(
        `  ${status} ${result.email}: synced=${result.synced}, already=${result.alreadyInPG}, failed=${result.failed}`,
      );
    }

    console.log("\nsync complete\n");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("Fatal error:", errorMessage(error));
  process.exit(1);
});
