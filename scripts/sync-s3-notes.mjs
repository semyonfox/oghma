#!/usr/bin/env node
// Direct sync script: Syncs all S3 notes to PostgreSQL
// Usage: node scripts/sync-s3-notes.mjs

import postgres from 'postgres';
import { getStorageProvider } from '../src/lib/storage/init.js';

async function getAllNotesFromS3() {
  try {
    const storage = getStorageProvider();
    const indexJson = await storage.getObject('notes/index.json');
    if (!indexJson) {
      console.log('Notes index not found in S3');
      return [];
    }
    const index = JSON.parse(indexJson);
    return Object.values(index.notes || {});
  } catch (error) {
    console.error('Error reading notes from S3:', error);
    return [];
  }
}

async function addNoteToTree(sql, userId, noteId, parentId) {
  try {
    const posResult = await sql`
      SELECT COALESCE(MAX(position), 0) as max_pos
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND parent_id IS ${parentId}
    `;

    const position = (posResult[0]?.max_pos || 0) + 1;

    await sql`
      INSERT INTO app.tree_items (user_id, note_id, parent_id, position)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${parentId}, ${position})
      ON CONFLICT DO NOTHING
    `;
  } catch (error) {
    console.error(`Error adding note ${noteId} to tree:`, error);
  }
}

async function syncS3ToPG(sql, userId) {
  const result = {
    success: false,
    totalInS3: 0,
    alreadyInPG: 0,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get all notes from S3
    const s3Notes = await getAllNotesFromS3();
    result.totalInS3 = s3Notes.length;

    if (s3Notes.length === 0) {
      result.success = true;
      return result;
    }

    // Get notes already in PostgreSQL
    const pgNotes = await sql`
      SELECT note_id FROM app.notes 
      WHERE user_id = ${userId}::uuid
    `;
    const pgNoteIds = new Set(pgNotes.map(n => n.note_id));

    // Process each note from S3
    for (const s3Note of s3Notes) {
      try {
        const noteId = s3Note.id;

        // Check if note already exists in PG
        if (pgNoteIds.has(noteId)) {
          result.alreadyInPG++;
          continue;
        }

        // Insert note into PostgreSQL
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
            ${s3Note.title || 'Untitled'},
            ${s3Note.content || ''},
            ${s3Note.deleted || 0},
            ${s3Note.deleted_at ? new Date(s3Note.deleted_at) : null},
            ${s3Note.shared || 0},
            ${s3Note.pinned || 0},
            ${s3Note.created_at ? new Date(s3Note.created_at) : new Date()},
            ${s3Note.updated_at ? new Date(s3Note.updated_at) : new Date()}
          )
          ON CONFLICT (note_id) DO NOTHING
        `;

        // Add to tree if not soft-deleted
        if (!s3Note.deleted) {
          const parentId = s3Note.pid || null;
          await addNoteToTree(sql, userId, noteId, parentId);
        }

        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          noteId: s3Note.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Error syncing note ${s3Note.id}:`, error);
      }
    }

    result.success = true;
    return result;
  } catch (error) {
    console.error('Error in S3 to PG sync:', error);
    result.success = false;
    return result;
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(dbUrl, {
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('starting S3 to PostgreSQL sync...\n');

    // Get all users
    const users = await sql`
      SELECT user_id, email FROM app.login
      ORDER BY created_at ASC
    `;

    if (users.length === 0) {
      console.log('no users found to migrate');
      await sql.end();
      return;
    }

    console.log(`Found ${users.length} user(s)\n`);

    // Sync notes for each user
    const results = [];
    for (const user of users) {
      console.log(`Syncing notes for ${user.email} (${user.user_id})...`);
      const result = await syncS3ToPG(sql, user.user_id);
      results.push({
        email: user.email,
        userId: user.user_id,
        ...result,
      });

      if (result.success) {
        console.log(`  ✓ Synced: ${result.synced}, Already in PG: ${result.alreadyInPG}, Failed: ${result.failed}`);
      } else {
        console.log(`  ✗ Sync failed`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SYNC SUMMARY');
    console.log('='.repeat(60));

    const totals = results.reduce(
      (acc, r) => ({
        totalS3: acc.totalS3 + (r.totalInS3 || 0),
        totalSynced: acc.totalSynced + (r.synced || 0),
        totalAlready: acc.totalAlready + (r.alreadyInPG || 0),
        totalFailed: acc.totalFailed + (r.failed || 0),
      }),
      { totalS3: 0, totalSynced: 0, totalAlready: 0, totalFailed: 0 }
    );

    console.log(`\nTotal notes in S3: ${totals.totalS3}`);
    console.log(`Synced to PostgreSQL: ${totals.totalSynced}`);
    console.log(`Already in PostgreSQL: ${totals.totalAlready}`);
    console.log(`Failed: ${totals.totalFailed}`);

    console.log('\nPer-user results:');
    results.forEach(r => {
      const status = r.success ? '✓' : '✗';
      console.log(`  ${status} ${r.email}: synced=${r.synced}, already=${r.alreadyInPG}, failed=${r.failed}`);
    });

    console.log('\nsync complete\n');

    await sql.end();
  } catch (error) {
    console.error('Fatal error:', error);
    await sql.end();
    process.exit(1);
  }
}

main();
