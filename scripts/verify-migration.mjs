#!/usr/bin/env node

import postgres from 'postgres';

const ENV = process.env;

if (!ENV.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
}

const sql = postgres(ENV.DATABASE_URL, { ssl: 'require', debug: false });

async function verify() {
    try {
        console.log('🔍 Verifying schema...\n');

        // Check tables exist
        const tables = await sql`
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'app' 
            ORDER BY tablename
        `;

        console.log('📋 Tables created:');
        tables.forEach(t => console.log(`   ✓ ${t.tablename}`));

        // Check columns in app.notes
        const noteColumns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'notes'
            ORDER BY ordinal_position
        `;

        console.log('\n📊 app.notes columns:');
        noteColumns.forEach(c => console.log(`   ✓ ${c.column_name} (${c.data_type})`));

        // Check tree_items exists
        const treeColumns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'tree_items'
            ORDER BY ordinal_position
        `;

        console.log('\n🌳 app.tree_items columns:');
        treeColumns.forEach(c => console.log(`   ✓ ${c.column_name} (${c.data_type})`));

        // Check row counts
        const counts = await sql`
            SELECT 'app.login' AS table_name, COUNT(*) FROM app.login
            UNION ALL
            SELECT 'app.notes', COUNT(*) FROM app.notes
            UNION ALL
            SELECT 'app.tree_items', COUNT(*) FROM app.tree_items
            UNION ALL
            SELECT 'app.attachments', COUNT(*) FROM app.attachments
            UNION ALL
            SELECT 'app.pdf_annotations', COUNT(*) FROM app.pdf_annotations
        `;

        console.log('\n📈 Row counts:');
        counts.forEach(c => console.log(`   ${c.table_name}: ${c.count} rows`));

        // Check if backup tables exist
        const backup = await sql`
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'backup' 
            ORDER BY tablename
        `;

        if (backup.length > 0) {
            console.log('\n💾 Backup schema found:');
            backup.forEach(b => console.log(`   ✓ backup.${b.tablename}`));
        }

        console.log('\n✅ Schema verification successful!');
        console.log('\n🎉 Database is ready for use with react-complex-tree migration.\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Verification failed:', error.message);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

verify();
