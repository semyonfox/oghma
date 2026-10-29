import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

import { readTopicMarks } from "@/lib/notes/storage/tree-topics";

const MAP = "11111111-1111-4111-8111-111111111111";
const TOPIC = "22222222-2222-4222-8222-222222222222";
const queryText = (call: unknown[]) => (call[0] as string[]).join("?");

describe("readTopicMarks", () => {
  beforeEach(() => {
    mocks.sql.mockReset();
  });

  it("reads any number of rows in two queries, passing the ids as one array", async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `note-${index}`);
    mocks.sql
      .mockResolvedValueOnce(
        ids.map((id) => ({
          row_id: id,
          map_id: MAP,
          associations: [
            { topicId: TOPIC, relevance: "core", probability: 0.9, evidence: [], status: "accepted", origin: "automatic" },
          ],
          overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
          taxonomy_version: 2,
          map_taxonomy_version: 2,
        })),
      )
      .mockResolvedValueOnce([{ id: MAP, topics: [{ id: TOPIC, name: "Scheduling" }] }]);

    const marks = await readTopicMarks("user", ids);

    expect(mocks.sql).toHaveBeenCalledTimes(2);
    const [materials, maps] = mocks.sql.mock.calls;
    expect(materials).toContainEqual(ids);
    expect(queryText(materials)).toContain("extracted_from_note_id");
    expect(queryText(materials)).toContain("DISTINCT ON (p.row_id, material.map_id)");
    expect(maps).toContainEqual([MAP]);
    expect(marks.size).toBe(60);
    expect(marks.get("note-7")).toEqual([
      { mapId: MAP, topicId: TOPIC, name: "Scheduling", topicIndex: 0, main: true, suggested: false },
    ]);
  });

  it("skips the database when there is nothing to mark", async () => {
    expect((await readTopicMarks("user", [])).size).toBe(0);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("doesn't ask for map topics when no row is in a study map", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    expect((await readTopicMarks("user", ["a", "b"])).size).toBe(0);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it("drops a malformed material instead of failing the folder", async () => {
    mocks.sql
      .mockResolvedValueOnce([
        { row_id: "a", map_id: MAP, associations: "broken", overrides: {}, taxonomy_version: 1, map_taxonomy_version: 1 },
      ])
      .mockResolvedValueOnce([{ id: MAP, topics: [{ id: TOPIC, name: "Scheduling" }] }]);
    expect((await readTopicMarks("user", ["a"])).size).toBe(0);
  });
});
