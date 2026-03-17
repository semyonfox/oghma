#!/usr/bin/env node

/**
 * Safe database migration runner
 * 
 * This script:
 * 1. Reads the migration SQL file
 * 2. Connects to the database
 * 3. Runs the migration in a transaction (so it either succeeds fully or rolls back)
 * 4. Reports success/failure
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';

const ENV = process.env;
const migrationPath = resolve('./database/migrations/006_consolidated_safe_migration.sql');

console.log('🔄 OghmaNotes Database Migration');
console.log('================================\n');

// Verify environment
if (!ENV.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not set');
    process.exit(1);
}

console.log('📍 Database:', ENV.DATABASE_URL.replace(/:[^@]*@/, ':***@'));

// Read migration file
let migrationSQL;
try {
    migrationSQL = readFileSync(migrationPath, 'utf-8');
    console.log('✅ Migration file loaded:', migrationPath);
} catch (err) {
    console.error('❌ Failed to read migration file:', err.message);
    process.exit(1);
}

// Connect to database
const sql = postgres(ENV.DATABASE_URL, {
    ssl: ENV.DATABASE_URL.includes('localhost') ? false : 'require',
    debug: false,
});

async function runMigration() {
    try {
        console.log('\n⏳ Running migration...\n');

        // Run the entire migration as a single statement
        // postgres.js will handle transaction wrapping
        const result = await sql.unsafe(migrationSQL);

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Tables created:');
        console.log('   - app.login (users)');
        console.log('   - app.notes (notes & folders)');
        console.log('   - app.tree_items (file tree structure)');
        console.log('   - app.attachments (file uploads)');
        console.log('   - app.pdf_annotations (PDF markups)');

        console.log('\n🔐 All primary keys are now UUID v7');
        console.log('📁 Folder support enabled (is_folder column)');
        console.log('🗑️  Soft delete support enabled (deleted_at column)');

        console.log('\n📋 Backup tables (if data existed):');
        console.log('   - backup.login_backup');
        console.log('   - backup.notes_backup');
        console.log('   - backup.tree_items_backup');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration failed:');
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
