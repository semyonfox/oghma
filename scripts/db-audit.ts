// Read-only structural and resource inventory. Never outputs queries or row data.
import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const sql = postgres(url, {
  max: 1,
  connection: { application_name: 'oghmanotes-db-audit', default_transaction_read_only: true, statement_timeout: 10000, lock_timeout: 1000 },
});
try {
  const [server] = await sql`SELECT current_setting('server_version') AS version,
    current_setting('max_connections')::int AS max_connections`;
  const relations = await sql`SELECT relname, n_live_tup, n_dead_tup, seq_scan, idx_scan,
      pg_table_size(relid)::text AS table_bytes, pg_indexes_size(relid)::text AS index_bytes,
      last_autovacuum, last_autoanalyze
    FROM pg_stat_user_tables WHERE schemaname = 'app' ORDER BY pg_total_relation_size(relid) DESC`;
  const indexes = await sql`SELECT i.indexrelname, pg_get_indexdef(i.indexrelid) AS definition,
    i.idx_scan, pg_relation_size(i.indexrelid)::text AS bytes, p.indisvalid
    FROM pg_stat_user_indexes i JOIN pg_index p ON p.indexrelid = i.indexrelid
    WHERE i.schemaname = 'app' ORDER BY i.relname, i.indexrelname`;
  const constraints = await sql`SELECT c.conrelid::regclass::text AS relation, c.conname,
    c.convalidated, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'app' ORDER BY relation, c.conname`;
  const connections = await sql`SELECT application_name, state, wait_event_type, count(*)::int AS count
    FROM pg_stat_activity WHERE datname = current_database()
    GROUP BY application_name, state, wait_event_type`;
  const migrations = await sql`SELECT version, name FROM app.schema_migrations ORDER BY name`;
  console.log(JSON.stringify({ collectedAt: new Date().toISOString(), server, relations, indexes, constraints, connections, migrations }, null, 2));
} finally { await sql.end(); }
