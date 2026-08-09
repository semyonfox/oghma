import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql.js", () => {
  const sqlMock = vi.fn();
  (sqlMock as any).begin = vi.fn(
    async (callback: (tx: typeof sqlMock) => unknown) => callback(sqlMock),
  );
  return { default: sqlMock };
});

vi.mock("uuid", () => ({
  v4: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

import sql from "@/database/pgsql.js";
import {
  findOrCreateVaultFolder,
  VaultImportCancelledError,
} from "@/lib/vault/tree-builder";

const userId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

describe("vault tree lifecycle fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([] as never);
  });

  it("does not create folders for a cancelled Vault import", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([] as never); // no active job

    await expect(
      findOrCreateVaultFolder(userId, "Course", null, jobId),
    ).rejects.toBeInstanceOf(VaultImportCancelledError);
  });

  it("creates a folder only while its Vault import remains active", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([] as never) // advisory lock
      .mockResolvedValueOnce([{ id: jobId }] as never) // active job
      .mockResolvedValueOnce([] as never) // no existing folder
      .mockResolvedValueOnce([] as never) // note insert
      .mockResolvedValueOnce([] as never); // tree insert

    await expect(
      findOrCreateVaultFolder(userId, "Course", null, jobId),
    ).resolves.toBe("11111111-1111-4111-8111-111111111111");
  });
});
