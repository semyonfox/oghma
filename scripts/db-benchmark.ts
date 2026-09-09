// Synthetic comparison only; never run against a populated/shared database.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_audit_e2e')) {
  throw new Error('Requires loopback *_audit_e2e database');
}
interface PlanNode { 'Node Type': string; 'Index Name'?: string; Plans?: PlanNode[] }
interface ExplainRow { 'QUERY PLAN': { 'Execution Time': number; Plan: PlanNode }[] }
const sql = postgres(url, { max: 1, onnotice: () => {}, connection: { statement_timeout: 30000 } });
const owner = randomUUID();
function indexes(node: PlanNode): string[] {
  return [...(node['Index Name'] ? [node['Index Name']] : []), ...(node.Plans ?? []).flatMap(indexes)];
}
try {
  const [existing] = await sql`SELECT count(*)::int AS count FROM app.login`;
  if (existing.count !== 0) throw new Error('Benchmark requires an empty synthetic fixture');
  await sql`INSERT INTO app.login (user_id, email, hashed_password) VALUES (${owner}, ${`${owner}@example.test`}, 'synthetic')`;
  const output: object[] = [];
  for (const count of [100, 1000, 10000]) {
    await sql`DELETE FROM app.notes WHERE user_id = ${owner}`;
    const started = performance.now();
    await sql`INSERT INTO app.notes (user_id, title, content)
      SELECT ${owner}::uuid, 'Lecture ' || n,
        repeat('Study notes ' || md5(n::text) || ' methods and exercises. ', 20) || CASE WHEN n % 97 = 0 THEN ' rarequartzmarker' ELSE '' END
      FROM generate_series(1, ${count}) n`;
    const insertMs = performance.now() - started;
    await sql`VACUUM (ANALYZE) app.notes`;
    for (const pattern of ['%rarequartzmarker%', '%methods%', '%zznotpresentzz%', '%ab%']) {
      const indexed: number[] = [], baseline: number[] = [];
      let used: string[] = [];
      const query = (db: postgres.Sql | postgres.TransactionSql) => db<ExplainRow[]>`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT note_id, title, LEFT(content, 200) FROM app.notes
        WHERE user_id = ${owner}::uuid AND deleted_at IS NULL
          AND (title ILIKE ${pattern} OR content ILIKE ${pattern})
        ORDER BY CASE WHEN title ILIKE ${pattern} THEN 0 ELSE 1 END, updated_at DESC LIMIT 20
      `;
      for (let run = 0; run < 12; run++) {
        const [row] = await query(sql);
        if (run > 1) indexed.push(row['QUERY PLAN'][0]['Execution Time']);
        used = indexes(row['QUERY PLAN'][0].Plan);
      }
      await sql.begin(async tx => {
        await tx`DROP INDEX app.idx_notes_title_trgm`;
        await tx`DROP INDEX app.idx_notes_content_trgm`;
        for (let run = 0; run < 12; run++) {
          const [row] = await query(tx);
          if (run > 1) baseline.push(row['QUERY PLAN'][0]['Execution Time']);
        }
        // Restore the indexes with transaction rollback, without a rebuild.
        throw new Error('rollback benchmark comparison');
      }).catch(error => { if (!(error instanceof Error) || error.message !== 'rollback benchmark comparison') throw error; });
      const summary = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return { medianMs: sorted[Math.floor(sorted.length / 2)], maxMs: sorted.at(-1) };
      };
      output.push({ notes: count, pattern, insertMs, indexed: summary(indexed), withoutSubstringIndexes: summary(baseline), indexes: used });
    }
  }
  const sizes = await sql`SELECT pg_table_size('app.notes')::text AS table_bytes, pg_indexes_size('app.notes')::text AS index_bytes`;
  console.log(JSON.stringify({ workload: 'Synthetic, one user, about 1.5 KB per body, warm runs after VACUUM ANALYZE, 1 CPU/512 MB container. Timings are PostgreSQL execution only; not production latency.', results: output, sizes }, null, 2));
} finally {
  await sql`DELETE FROM app.login WHERE user_id = ${owner}`;
  await sql.end();
}
