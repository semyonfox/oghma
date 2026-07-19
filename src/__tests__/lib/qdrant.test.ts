import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadQdrant() {
  vi.resetModules();
  process.env.QDRANT_URL = "http://qdrant.test";
  process.env.QDRANT_COLLECTION = "test_chunks";
  return await import("@/lib/qdrant");
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_COLLECTION;
  delete process.env.QDRANT_API_KEY;
});

describe("qdrant vector store", () => {
  it("creates the collection and upserts chunk vectors with link-back payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(jsonResponse({ result: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { upsertChunkVectors } = await loadQdrant();
    await upsertChunkVectors([
      {
        chunkId: "33333333-3333-4333-8333-333333333333",
        documentId: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
        vector: [0.1, 0.2, 0.3],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://qdrant.test/collections/test_chunks",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: 3, distance: "Cosine" },
          hnsw_config: {
            m: 16,
            ef_construct: 100,
          },
          optimizers_config: {
            indexing_threshold: 1,
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://qdrant.test/collections/test_chunks/points?wait=true",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          points: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              vector: [0.1, 0.2, 0.3],
              payload: {
                chunk_id: "33333333-3333-4333-8333-333333333333",
                document_id: "22222222-2222-4222-8222-222222222222",
                user_id: "11111111-1111-4111-8111-111111111111",
              },
            },
          ],
        }),
      }),
    );
  });

  it("searches by user and scope, returning cosine distance from Qdrant scores", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: { config: { params: { vectors: { size: 3 } } } },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(jsonResponse({ result: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              score: 0.92,
              payload: {
                chunk_id: "33333333-3333-4333-8333-333333333333",
                document_id: "22222222-2222-4222-8222-222222222222",
                user_id: "11111111-1111-4111-8111-111111111111",
              },
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              score: 0.1,
              payload: {
                chunk_id: "44444444-4444-4444-8444-444444444444",
                document_id: "55555555-5555-4555-8555-555555555555",
                user_id: "11111111-1111-4111-8111-111111111111",
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { searchChunkVectors } = await loadQdrant();
    const hits = await searchChunkVectors({
      userId: "11111111-1111-4111-8111-111111111111",
      vector: [0.3, 0.2, 0.1],
      documentIds: ["22222222-2222-4222-8222-222222222222"],
      excludeDocumentIds: ["99999999-9999-4999-8999-999999999999"],
      excludeChunkIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      maxDistance: 0.5,
      limit: 10,
    });

    const searchBody = JSON.parse(fetchMock.mock.calls[4][1].body);
    expect(searchBody.filter).toEqual({
      must: [
        {
          key: "user_id",
          match: { value: "11111111-1111-4111-8111-111111111111" },
        },
        {
          key: "document_id",
          match: { any: ["22222222-2222-4222-8222-222222222222"] },
        },
      ],
      must_not: [
        {
          key: "document_id",
          match: { any: ["99999999-9999-4999-8999-999999999999"] },
        },
        { has_id: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] },
      ],
    });
    expect(hits).toEqual([
      {
        chunkId: "33333333-3333-4333-8333-333333333333",
        documentId: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
        score: 0.92,
        distance: expect.closeTo(0.08, 6),
      },
    ]);
  });

  it("deletes vectors by chunk id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { deleteChunkVectors } = await loadQdrant();
    await deleteChunkVectors(["33333333-3333-4333-8333-333333333333"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://qdrant.test/collections/test_chunks/points/delete?wait=true",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          points: ["33333333-3333-4333-8333-333333333333"],
        }),
      }),
    );
  });

  it("reads canonical vectors for inference-free user materialization", async () => {
    const chunkId = "33333333-3333-4333-8333-333333333333";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      result: [{ id: chunkId, vector: [0.1, 0.2], payload: { chunk_id: chunkId } }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getChunkVectors } = await loadQdrant();
    await expect(getChunkVectors([chunkId, chunkId])).resolves.toEqual([
      { chunkId, vector: [0.1, 0.2] },
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      ids: [chunkId], with_payload: true, with_vector: true,
    });
  });
});
