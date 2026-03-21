#!/usr/bin/env node

// reads migration SQL, runs it in a transaction, reports result
import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';

const ENV = process.env;
const migrationPath = resolve('./database/migrations/006_consolidated_safe_migration.sql');

console.log('OghmaNotes database migration');
console.log('================================\n');

// Verify environment
if (!ENV.DATABASE_URL) {
    console.error('error: DATABASE_URL not set');
    process.exit(1);
}

console.log('database:', ENV.DATABASE_URL.replace(/:[^@]*@/, ':***@'));

// Read migration file
let migrationSQL;
try {
    migrationSQL = readFileSync(migrationPath, 'utf-8');
    console.log('migration file loaded:', migrationPath);
} catch (err) {
    console.error('failed to read migration file:', err.message);
    process.exit(1);
}

// Connect to database
const sql = postgres(ENV.DATABASE_URL, {
    ssl: ENV.DATABASE_URL.includes('localhost') ? false : 'require',
    debug: false,
});

async function runMigration() {
    try {
        console.log('\nrunning migration...\n');

        // Run the entire migration as a single statement
        // postgres.js will handle transaction wrapping
        const result = await sql.unsafe(migrationSQL);

        console.log('\nmigration completed successfully');
        console.log('\ntables created:');
        console.log('   - app.login (users)');
        console.log('   - app.notes (notes & folders)');
        console.log('   - app.tree_items (file tree structure)');
        console.log('   - app.attachments (file uploads)');
        console.log('   - app.pdf_annotations (PDF markups)');

        console.log('\nall primary keys are now UUID v7');
        console.log('folder support enabled (is_folder column)');
        console.log('soft delete support enabled (deleted_at column)');

        console.log('\nbackup tables (if data existed):');
        console.log('   - backup.login_backup');
        console.log('   - backup.notes_backup');
        console.log('   - backup.tree_items_backup');

        process.exit(0);
    } catch (error) {
        console.error('\nmigration failed:');
        console.error(error.message);

        if (error.detail) {
            console.error('\nDetails:', error.detail);
        }

        process.exit(1);
    } finally {
        await sql.end();
    }
}

runMigration();
