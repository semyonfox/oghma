import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import sql from "@/database/pgsql";
import { purgeStaleStudyCaches, STUDY_CACHE_RETENTION_DAYS } from "@/lib/study-map/cache";

describe("purgeStaleStudyCaches", () => {
  it("ages out both shared study caches", async () => {
    vi.mocked(sql)
      .mockResolvedValueOnce([1, 1] as never)
      .mockResolvedValueOnce([1] as never);

    expect(await purgeStaleStudyCaches()).toBe(3);

    const statements = vi.mocked(sql).mock.calls.map((call) => (call[0] as unknown as string[]).join("?"));
    expect(statements[0]).toContain("DELETE FROM app.study_decision_cache");
    expect(statements[1]).toContain("DELETE FROM app.study_generation_cache");
    expect(vi.mocked(sql).mock.calls[0]).toContain(STUDY_CACHE_RETENTION_DAYS);
  });
});
