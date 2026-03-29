#!/usr/bin/env node
// Direct sync script: Syncs all S3 notes to PostgreSQL
// Usage: DATABASE_URL=... node scripts/sync-s3-notes.js

const postgres = require('postgres');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return UUID_REGEX.test(id);
}

function generateUUIDForId(id) {
  // Generate deterministic UUID based on old ID
  // This ensures same old ID always maps to same UUID
  const _namespace = '00000000-0000-5000-a000-000000000000'; // DNS namespace
  const hash = crypto.createHash('sha1');
  hash.update(id);
  const digest = hash.digest();
  
  // Manually construct UUID v5-like structure from hash
  digest[6] = (digest[6] & 0x0f) | 0x50; // Set version to 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // Set variant
  
  const hex = digest.toString('hex');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

// Get environment variables
const dbUrl = process.env.DATABASE_URL;
const bucket = process.env.STORAGE_BUCKET;
const region = process.env.STORAGE_REGION;
const accessKey = process.env.STORAGE_ACCESS_KEY;
const secretKey = process.env.STORAGE_SECRET_KEY;

if (!dbUrl) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

if (!bucket || !region || !accessKey || !secretKey) {
  console.error('ERROR: S3 configuration incomplete');
  console.error('Required: STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY');
  process.exit(1);
}

const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
});

async function getAllNotesFromS3() {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: 'notes/index.json',
    });
    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    const index = JSON.parse(body);
    return Object.values(index.notes || {});
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      console.log('Notes index not found in S3');
      return [];
    }
    throw error;
  }
}

async function addNoteToTree(userId, noteId, parentId) {
  // Tree sync is optional - silently skip if schema doesn't match
  try {
    const actualParentId = parentId || null;
    const posResult = await sql`
      SELECT COALESCE(MAX(position), 0) as max_pos
      FROM app.tree_items
      WHERE user_id = ${userId}::uuid AND parent_id IS NOT DISTINCT FROM ${actualParentId}
    `;

    const position = (posResult[0]?.max_pos || 0) + 1;

    await sql`
      INSERT INTO app.tree_items (user_id, note_id, parent_id, position)
      VALUES (${userId}::uuid, ${noteId}::uuid, ${actualParentId}, ${position})
      ON CONFLICT DO NOTHING
    `;
  } catch (_error) {
    // Silently ignore tree sync errors
  }
}

async function syncS3ToPG(userId) {
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
        // Convert old ID to UUID if needed
        let noteId = s3Note.id;
        if (!isValidUUID(noteId)) {
          noteId = generateUUIDForId(noteId);
        }

        // Check if note already exists in PG
        if (pgNoteIds.has(noteId)) {
          result.alreadyInPG++;
          continue;
        }

        // Insert note into PostgreSQL
        // Note: tree_items.parent_id is INTEGER, not UUID
        // All notes go to root (parent_id = NULL)
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

        // Add to tree (always root since parent_id is INTEGER, not UUID)
        if (!s3Note.deleted) {
          await addNoteToTree(userId, noteId, null);
        }

        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          noteId: s3Note.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`Error syncing note ${s3Note.id}:`, error.message);
      }
    }

    result.success = true;
    return result;
  } catch (error) {
    console.error('Error in S3 to PG sync:', error.message);
    result.success = false;
    return result;
  }
}

async function main() {
  try {
    console.log('🔄 Starting S3 to PostgreSQL sync...\n');

    // Get all users
    const users = await sql`
      SELECT user_id, email FROM app.login
      ORDER BY created_at ASC
    `;

    if (users.length === 0) {
      console.log('ℹ️  No users found to migrate');
      await sql.end();
      return;
    }

    console.log(`Found ${users.length} user(s)\n`);

    // Sync notes for each user
    const results = [];
    for (const user of users) {
      console.log(`Syncing notes for ${user.email} (${user.user_id})...`);
      const result = await syncS3ToPG(user.user_id);
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
    console.log('\n' + '='.repeat(70));
    console.log('SYNC SUMMARY');
    console.log('='.repeat(70));

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

    if (totals.totalFailed === 0) {
      console.log('\n✅ Sync complete! All notes are now in PostgreSQL.\n');
    } else {
      console.log(`\n⚠️  Sync complete with ${totals.totalFailed} errors.\n`);
    }

    await sql.end();
  } catch (error) {
    console.error('Fatal error:', error.message);
    if (error.stack) console.error(error.stack);
    await sql.end();
    process.exit(1);
  }
}

main();
