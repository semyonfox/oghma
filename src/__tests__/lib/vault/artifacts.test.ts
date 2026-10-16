import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { begin: vi.fn() }),
  deleteObject: vi.fn(),
}));

vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/storage/init", () => ({
  getStorageProvider: () => ({ deleteObject: mocks.deleteObject }),
}));

import { cleanupVaultArtifacts, findLiveVaultExport } from "@/lib/vault/artifacts";

function queryText(call: unknown[]): string {
  const [strings] = call;
  return Array.isArray(strings) ? strings.join("?") : "";
}

function routeQueries(routes: Array<[string, unknown[]]>) {
  mocks.sql.mockImplementation(async (...call: unknown[]) => {
    const text = queryText(call);
    return routes.find(([fragment]) => text.includes(fragment))?.[1] ?? [];
  });
}

describe("vault artifact retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.begin.mockImplementation(
      async (cb: (tx: typeof mocks.sql) => Promise<unknown>) => cb(mocks.sql),
    );
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it("deletes an expired export archive and stops its job advertising the download", async () => {
    routeQueries([
      ["ORDER BY a.expires_at LIMIT 100", [{ id: "artifact-1" }]],
      ["SELECT user_id, kind FROM app.vault_artifacts", [{ user_id: "u1", kind: "export" }]],
      ["SELECT id, s3_key, job_id FROM app.vault_artifacts", [
        { id: "artifact-1", s3_key: "exports/u1/job-1/vault-export.zip", job_id: "job-1" },
      ]],
      ["SELECT status FROM app.canvas_import_jobs", [{ status: "complete" }]],
    ]);

    await expect(cleanupVaultArtifacts()).resolves.toBe(1);

    expect(mocks.deleteObject).toHaveBeenCalledWith(
      "exports/u1/job-1/vault-export.zip",
      expect.any(AbortSignal),
    );
    const cleared = mocks.sql.mock.calls.find((call) => queryText(call).includes("SET output_s3_key = NULL"));
    expect(cleared).toContain("job-1");
  });

  it("keeps the reservation when the storage delete fails so the next sweep retries", async () => {
    routeQueries([
      ["ORDER BY a.expires_at LIMIT 100", [{ id: "artifact-1" }]],
      ["SELECT user_id, kind FROM app.vault_artifacts", [{ user_id: "u1", kind: "upload" }]],
      ["SELECT id, s3_key, job_id FROM app.vault_artifacts", [
        { id: "artifact-1", s3_key: "vault-uploads/u1/x/vault.zip", job_id: null },
      ]],
    ]);
    mocks.deleteObject.mockRejectedValueOnce(new Error("storage down"));

    await expect(cleanupVaultArtifacts()).rejects.toThrow("storage down");

    expect(mocks.sql.mock.calls.some((call) => queryText(call).includes("DELETE FROM app.vault_artifacts"))).toBe(false);
  });

  it("never signs a link past the archive's remaining lifetime", async () => {
    routeQueries([["FROM app.vault_artifacts", [{ s3_key: "exports/u1/j/vault-export.zip", seconds_left: 120 }]]]);
    await expect(findLiveVaultExport("u1", "j")).resolves.toEqual({
      s3Key: "exports/u1/j/vault-export.zip",
      secondsLeft: 120,
    });

    routeQueries([]);
    await expect(findLiveVaultExport("u1", "j")).resolves.toBeNull();
  });
});
