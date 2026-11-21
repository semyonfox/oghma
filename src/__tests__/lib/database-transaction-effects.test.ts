import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// a stand-in client: begin() runs the callback and either commits or rethrows
vi.mock('postgres', () => ({
  default: vi.fn(() => ({
    begin: async (work: (tx: object) => Promise<unknown>) => work({}),
  })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', 'postgres://audit@127.0.0.1:1/audit');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('database transaction effects', () => {
  it('runs every post-commit effect even when an earlier one fails', async () => {
    const { withDatabaseTransaction, afterDatabaseCommit } = await import('@/database/pgsql');
    const published: string[] = [];

    await expect(withDatabaseTransaction(async () => {
      await afterDatabaseCommit(async () => { throw new Error('cache unavailable'); });
      await afterDatabaseCommit(async () => { published.push("tree invalidated"); });
      return 'committed';
    })).rejects.toThrow('cache unavailable');

    expect(published).toEqual(["tree invalidated"]);
  });

  it('compensates in reverse and skips post-commit effects when the work fails', async () => {
    const { withDatabaseTransaction, afterDatabaseCommit, afterDatabaseRollback } = await import('@/database/pgsql');
    const order: string[] = [];

    await expect(withDatabaseTransaction(async () => {
      afterDatabaseRollback(async () => { order.push('first'); });
      afterDatabaseRollback(async () => { order.push('second'); });
      await afterDatabaseCommit(async () => { order.push("commit"); });
      throw new Error('publication failed');
    })).rejects.toThrow('publication failed');

    expect(order).toEqual(['second', 'first']);
  });
});
