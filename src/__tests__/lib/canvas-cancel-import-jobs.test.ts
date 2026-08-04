import { describe, expect, it, vi } from "vitest";

import { cancelActiveCanvasImportJobs } from "@/lib/canvas/cancel-import-jobs";

describe("cancelActiveCanvasImportJobs", () => {
  it("cancels pending Marker work with its Canvas job", async () => {
    const tx = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "11111111-1111-4111-8111-111111111111" }])
      .mockResolvedValue([]);

    const result = await cancelActiveCanvasImportJobs(
      tx,
      "22222222-2222-4222-8222-222222222222",
      "Cancelled by user",
    );

    expect(result).toEqual([{ id: "11111111-1111-4111-8111-111111111111" }]);
    const queries = tx.mock.calls.map((call) => call[0].join(""));
    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain("pg_advisory_xact_lock");
    expect(queries[2]).toContain("UPDATE app.marker_jobs");
    expect(queries[2]).toContain("status = 'cancelled'");
    expect(queries[3]).toContain("'pending_marker'");
    expect(queries[4]).toContain("UPDATE app.ingestion_jobs");
  });
});
