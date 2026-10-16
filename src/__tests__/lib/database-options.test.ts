import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('database connection settings', () => {
  it('passes server timeouts through the actual Postgres.js parser', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', 'postgres://audit@127.0.0.1:1/audit');
    vi.stubEnv('DB_STATEMENT_TIMEOUT', '1234');
    vi.stubEnv('DB_TRANSACTION_TIMEOUT', '2345');
    const { default: sql } = await import('@/database/pgsql');
    // Reading options initializes the client without opening a connection.
    const options: unknown = Reflect.get(sql, 'options');
    expect(options).toMatchObject({ connection: {
      statement_timeout: 1234, idle_in_transaction_session_timeout: 2345,
    }});
    await sql.end();
  });

  it.each([
    ['sslmode=verify-full', 'verify-full'],
    ['sslmode=require', 'require'],
    ['sslmode=disable', false],
    ['search_path=app,public', false],
  ])('keeps the TLS mode from %s', async (query, expected) => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', `postgres://audit@127.0.0.1:1/audit?${query}`);
    const { default: sql } = await import('@/database/pgsql');
    // an explicit ssl option used to override verify-full with plaintext
    expect(Reflect.get(sql, 'options')).toMatchObject({ ssl: expected });
    await sql.end();
  });

  it.each(['0', '-1', '2.5', '20junk', 'Infinity'])('rejects invalid pool limit %s', async value => {
    vi.resetModules();
    vi.stubEnv('DB_MAX_CONNECTIONS', value);
    await expect(import('@/lib/config')).rejects.toThrow('DB_MAX_CONNECTIONS must be a positive integer');
  });
});
