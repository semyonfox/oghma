import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { NextRequest } from 'next/server';
import { requireE2EDatabaseUrl } from '../helpers/env';

const auth = vi.hoisted(() => ({ userId: '' }));
const vectors = vi.hoisted(() => ({ delete: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/qdrant', () => ({ deleteChunkVectors: vectors.delete, setChunkVectorsSearchable: vi.fn() }));
vi.mock('@/lib/canvas/import-cache', () => ({ isSharedImportedFileKey: () => false }));
vi.mock('@/lib/storage/init', () => ({ getStorageProvider: () => { throw new Error('Vector-only cleanup must not require object storage'); } }));
vi.mock('@/lib/auth', () => ({ validateSession: async () => ({ user_id: auth.userId }), validateSessionLite: vi.fn() }));
vi.mock('@/lib/cache', () => ({ cacheGet: async () => null, cacheSet: async () => {}, cacheInvalidate: async () => {}, cacheKeys: { treeFull: () => 'tree', notesList: () => 'notes' } }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import appSql from '@/database/pgsql';
import { moveNoteInTree, TreeCycleError } from '@/lib/notes/storage/pg-tree';
import { processPendingNoteDeletionCleanup } from '@/lib/notes/storage/note-lifecycle';
import { pruneChatGenerationPayloads } from '@/lib/chat/generation-store';
import { GET } from '@/app/api/notes/route';
import { assertLegacySchema } from '../../../scripts/legacy-schema-contract';

const sql = postgres(requireE2EDatabaseUrl(), { max: 3 });
const owner = randomUUID();
const other = randomUUID();
const note = randomUUID();
const otherNote = randomUUID();

beforeAll(async () => {
  auth.userId = owner;
  for (const id of [owner, other]) await sql`INSERT INTO app.login (user_id, email, hashed_password) VALUES (${id}, ${`${id}@example.test`}, 'synthetic')`;
  await sql`INSERT INTO app.notes (note_id, user_id, title) VALUES (${note}, ${owner}, 'Owned'), (${otherNote}, ${other}, 'Other')`;
});
afterAll(async () => {
  await sql`DELETE FROM app.login WHERE user_id = ANY(${[owner, other]}::uuid[])`;
  await Promise.all([sql.end(), appSql.end()]);
});

describe('database hardening behavior', () => {
  it('adopts only a complete legacy schema', async () => { await assertLegacySchema(sql); });

  it('refuses to adopt missing legacy columns', async () => {
    await expect(sql.begin(async tx => {
      await tx`ALTER TABLE app.user_course_settings RENAME COLUMN canvas_course_id TO missing_course`;
      await expect(assertLegacySchema(tx)).rejects.toThrow('user_course_settings.canvas_course_id');
      throw new Error('restore fixture');
    })).rejects.toThrow('restore fixture');
  });

  it('enforces ownership and parent references on new writes', async () => {
    await expect(sql`INSERT INTO app.chunks (document_id, user_id, text) VALUES (${otherNote}, ${owner}, 'bad')`).rejects.toMatchObject({ code: '23503' });
    await expect(sql`INSERT INTO app.chunks (document_id, user_id, text) VALUES (${randomUUID()}, ${owner}, 'orphan')`).rejects.toMatchObject({ code: '23503' });
    await expect(sql`INSERT INTO app.note_links (user_id, source_note_id, target_note_id) VALUES (${owner}, ${note}, ${otherNote})`).rejects.toMatchObject({ code: '23503' });
    await expect(sql`INSERT INTO app.tree_items (user_id, note_id, parent_id) VALUES (${owner}, ${note}, ${otherNote})`).rejects.toMatchObject({ code: '23503' });
    await expect(sql`INSERT INTO app.chat_messages (id, session_id, role, content) VALUES (${randomUUID()}, ${randomUUID()}, 'user', 'orphan')`).rejects.toMatchObject({ code: '23503' });
    await sql`INSERT INTO app.chunks (document_id, user_id, text) VALUES (${note}, ${owner}, 'valid')`;
  });

  it('configures actual SQL timeouts and cancels slow statements', async () => {
    const [settings] = await appSql`SELECT current_setting('statement_timeout') AS statement, current_setting('idle_in_transaction_session_timeout') AS idle`;
    expect(settings).toMatchObject({ statement: '30s', idle: '30s' });
    await expect(appSql.begin(async tx => {
      await tx`SET LOCAL statement_timeout = '20ms'`;
      await tx`SELECT pg_sleep(0.2)`;
    })).rejects.toMatchObject({ code: '57014' });
    expect(await appSql`SELECT 1 AS recovered`).toMatchObject([{ recovered: 1 }]);
  });

  it('prevents simultaneous moves from producing a cycle', async () => {
    const a = randomUUID(), b = randomUUID();
    await sql`INSERT INTO app.notes (note_id, user_id, title, is_folder) VALUES (${a}, ${owner}, 'A', true), (${b}, ${owner}, 'B', true)`;
    await sql`INSERT INTO app.tree_items (user_id, note_id) VALUES (${owner}, ${a}), (${owner}, ${b})`;
    const outcomes = await Promise.allSettled([moveNoteInTree(owner, a, b), moveNoteInTree(owner, b, a)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find(result => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(TreeCycleError);
  });

  it('pages equal and sub-millisecond timestamps without duplicates or missing rows', async () => {
    const pagingOwner = randomUUID();
    await sql`INSERT INTO app.login (user_id, email, hashed_password) VALUES (${pagingOwner}, ${`${pagingOwner}@example.test`}, 'synthetic')`;
    auth.userId = pagingOwner;
    try {
      const ids = Array.from({ length: 6 }, () => randomUUID());
      for (let i = 0; i < ids.length; i++) await sql`INSERT INTO app.notes (note_id, user_id, title, created_at)
        VALUES (${ids[i]}, ${pagingOwner}, 'Page', ${i < 3 ? '2026-01-01T00:00:00.123456Z' : '2026-01-01T00:00:00.123455Z'}::text::timestamptz)`;
      const seen: string[] = [];
      let after: string | null = null;
      for (let page = 0; page < 4; page++) {
        const response = await GET(new NextRequest(`http://localhost/api/notes?limit=2${after ? `&after=${after}` : ''}`));
        expect(response.status).toBe(200);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Expected notes array');
        for (const row of data) {
          if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string') throw new Error('Invalid note');
          seen.push(row.id);
        }
        after = response.headers.get('X-Next-Cursor');
        if (!after) break;
      }
      expect(seen).toHaveLength(ids.length);
      expect(new Set(seen)).toEqual(new Set(ids));
      const bad = await GET(new NextRequest('http://localhost/api/notes?after=invalid'));
      expect(bad.status).toBe(400);
    } finally {
      auth.userId = owner;
      await sql`DELETE FROM app.login WHERE user_id = ${pagingOwner}`;
    }
  });

  it('expires only old terminal replay payloads, retaining messages and status', async () => {
    const session = randomUUID();
    await sql`INSERT INTO app.chat_sessions (id, user_id) VALUES (${session}, ${owner})`;
    await sql`INSERT INTO app.chat_messages (id, session_id, role, content) VALUES (${randomUUID()}, ${session}, 'assistant', 'Saved answer')`;
    for (const status of ['queued', 'generating', 'completed', 'failed', 'cancelled']) {
      await sql`INSERT INTO app.chat_generations (id, session_id, user_id, status, request_payload, updated_at)
        VALUES (${randomUUID()}, ${session}, ${owner}, ${status}, '{"synthetic":true}'::jsonb, NOW() - INTERVAL '8 days')`;
    }
    const recent = randomUUID();
    await sql`INSERT INTO app.chat_generations (id, session_id, user_id, status, request_payload)
      VALUES (${recent}, ${session}, ${owner}, 'completed', '{}'::jsonb)`;
    await pruneChatGenerationPayloads();
    const rows = await sql`SELECT id, status, request_payload FROM app.chat_generations WHERE session_id = ${session}`;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const keep = row.id === recent || ['queued', 'generating'].includes(row.status);
      expect(row.request_payload !== null).toBe(keep);
    }
    expect(await sql`SELECT content FROM app.chat_messages WHERE session_id = ${session}`).toMatchObject([{ content: 'Saved answer' }]);
  });

  it('retries vector cleanup without holding a DB lock or acknowledging another lease', async () => {
    const taskId = randomUUID();
    await sql`INSERT INTO app.note_deletion_cleanup_tasks (id, user_id, chunk_ids)
      VALUES (${taskId}, ${owner}, ${[randomUUID()]}::uuid[])`;
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vectors.delete.mockImplementationOnce(async () => { entered(); await blocked; });
    const first = processPendingNoteDeletionCleanup();
    await enteredPromise;
    try {
      // A slow external call leaves no transaction holding this row.
      await sql.begin(async tx => {
        await tx`SELECT id FROM app.note_deletion_cleanup_tasks WHERE id = ${taskId} FOR UPDATE NOWAIT`;
      });
      expect(await processPendingNoteDeletionCleanup()).toBe(0);
      await sql`UPDATE app.note_deletion_cleanup_tasks SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = ${taskId}`;
      expect(await processPendingNoteDeletionCleanup()).toBe(1);
    } finally { release(); }
    expect(await first).toBe(0);
    expect(await sql`SELECT id FROM app.note_deletion_cleanup_tasks WHERE id = ${taskId}`).toHaveLength(0);
  });

  it('keeps the canonical index keys and predicates', async () => {
    const rows = await sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'app'`;
    const byName = new Map(rows.map(row => [row.indexname, row.indexdef]));
    expect(byName.get('idx_notes_user_active')).toContain('(user_id, created_at DESC, note_id DESC)');
    expect(byName.get('idx_notes_user_active')).toContain('deleted_at IS NULL');
    expect(byName.get('idx_chat_messages_session_created')).toContain('(session_id, created_at DESC, id DESC)');
    expect(byName.has('idx_tree_user_parent')).toBe(false);
    expect(byName.has('idx_quiz_cards_user_due')).toBe(true);
    expect(byName.has('idx_notes_search_vector')).toBe(false);
  });
});
