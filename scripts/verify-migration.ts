#!/usr/bin/env -S npx tsx

import postgres from "postgres";

interface TableRow {
  tablename: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
}

interface CountRow {
  table_name: string;
  count: number | string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("error: DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(databaseUrl, { ssl: "require", debug: false });

async function verify(): Promise<void> {
  try {
    console.log("verifying schema...\n");

    const tables = await sql<TableRow[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'app'
      ORDER BY tablename
    `;
    console.log("tables created:");
    tables.forEach((table) => console.log(`   ✓ ${table.tablename}`));

    const noteColumns = await sql<ColumnRow[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'notes'
      ORDER BY ordinal_position
    `;
    console.log("\napp.notes columns:");
    noteColumns.forEach((column) =>
      console.log(`   ✓ ${column.column_name} (${column.data_type})`),
    );

    const treeColumns = await sql<ColumnRow[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'tree_items'
      ORDER BY ordinal_position
    `;
    console.log("\napp.tree_items columns:");
    treeColumns.forEach((column) =>
      console.log(`   ✓ ${column.column_name} (${column.data_type})`),
    );

    const counts = await sql<CountRow[]>`
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
    console.log("\nrow counts:");
    counts.forEach((count) =>
      console.log(`   ${count.table_name}: ${count.count} rows`),
    );

    const backup = await sql<TableRow[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'backup'
      ORDER BY tablename
    `;
    if (backup.length > 0) {
      console.log("\nbackup schema found:");
      backup.forEach((table) => console.log(`   ✓ backup.${table.tablename}`));
    }

    console.log("\nschema verification successful");
    console.log("database is ready for use with react-complex-tree migration.\n");
  } finally {
    await sql.end();
  }
}

verify().catch((error: unknown) => {
  console.error("\nverification failed:", errorMessage(error));
  process.exit(1);
});
