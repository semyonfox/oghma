import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedChunks } from '@/lib/embeddings';

describe('embedChunks', () => {
    beforeEach(() => {
        process.env.EMBEDDING_API_URL = 'https://test.api';
        process.env.EMBEDDING_API_KEY = 'fake-key';
        process.env.EMBEDDING_MODEL = 'test-model';
        delete process.env.EMBEDDING_FALLBACK_API_URL;
        delete process.env.EMBEDDING_FALLBACK_MODEL;
        delete process.env.EMBEDDING_FALLBACK_API_KEY;
        delete process.env.LLM_API_KEY;
        delete process.env.QDRANT_VECTOR_SIZE;
        delete process.env.EMBEDDING_DIMENSIONS;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('throws when embedding provider is not configured', async () => {
        delete process.env.EMBEDDING_API_URL;
        delete process.env.EMBEDDING_API_KEY;
        delete process.env.EMBEDDING_MODEL;
        await expect(embedChunks(['hello'])).rejects.toThrow('not configured');
    });

    it('returns empty array for empty input', async () => {
        const result = await embedChunks([]);
        expect(result).toEqual([]);
    });

    it('returns empty array when all chunks are whitespace', async () => {
        const result = await embedChunks(['  ', '\t', '']);
        expect(result).toEqual([]);
    });

    it('returns chunk + vector pairs for successful responses', async () => {
        const mockVector = [0.1, 0.2, 0.3];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { embedding: mockVector },
                    { embedding: mockVector },
                ],
            }),
        }));

        const result = await embedChunks(['hello world', 'another chunk']);
        expect(result).toHaveLength(2);
        expect(result[0].chunk).toBe('hello world');
        expect(result[0].vector).toEqual(mockVector);
        expect(result[1].chunk).toBe('another chunk');
    });

    it('orders indexed vectors to match their input chunks', async () => {
        process.env.QDRANT_VECTOR_SIZE = '2';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { index: 1, embedding: [0.3, 0.4] },
                    { index: 0, embedding: [0.1, 0.2] },
                ],
            }),
        }));

        await expect(embedChunks(['first', 'second'])).resolves.toEqual([
            { chunk: 'first', vector: [0.1, 0.2] },
            { chunk: 'second', vector: [0.3, 0.4] },
        ]);
    });

    it.each([
        ['duplicate', [{ index: 0, embedding: [0.1] }, { index: 0, embedding: [0.2] }]],
        ['out of range', [{ index: 0, embedding: [0.1] }, { index: 2, embedding: [0.2] }]],
        ['missing', [{ index: 0, embedding: [0.1] }, { embedding: [0.2] }]],
    ])('rejects %s response indices', async (_case, data) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data }),
        }));

        await expect(embedChunks(['first', 'second'])).rejects.toThrow(/indices/);
    });

    it('rejects vectors that do not match the configured Qdrant size', async () => {
        process.env.QDRANT_VECTOR_SIZE = '4096';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2] }] }),
        }));

        await expect(embedChunks(['first'])).rejects.toThrow(
            'Embedding dimension mismatch: expected 4096, got 2',
        );
    });

    it('throws when API call fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        }));

        await expect(embedChunks(['bad chunk'])).rejects.toThrow('Embedding API 500');
    });

    it('throws when embedding count mismatches', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ embedding: [0.1] }],
            }),
        }));

        await expect(embedChunks(['chunk one', 'chunk two'])).rejects.toThrow('count mismatch');
    });

    it('throws when fetch rejects with a network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

        await expect(embedChunks(['failing chunk'])).rejects.toThrow('network error');
    });
    it('uses the OpenRouter backup after the primary balance is exhausted', async () => {
        process.env.EMBEDDING_FALLBACK_API_URL = 'https://openrouter.test';
        process.env.EMBEDDING_FALLBACK_MODEL = 'qwen/qwen3-embedding-8b';
        process.env.EMBEDDING_FALLBACK_API_KEY = 'embedding-openrouter-key';
        process.env.LLM_API_KEY = 'chat-openrouter-key';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 402 })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const result = await embedChunks(['study note']);

        expect(result[0].vector).toEqual([0.1, 0.2]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toBe('https://openrouter.test/embeddings');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
            model: 'qwen/qwen3-embedding-8b',
        });
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
            'Bearer embedding-openrouter-key',
        );
    });

    it('uses the backup alone when the primary credential has been removed', async () => {
        delete process.env.EMBEDDING_API_KEY;
        process.env.EMBEDDING_FALLBACK_API_URL = 'https://openrouter.test';
        process.env.EMBEDDING_FALLBACK_MODEL = 'qwen/qwen3-embedding-8b';
        process.env.EMBEDDING_FALLBACK_API_KEY = 'embedding-openrouter-key';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.4] }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(embedChunks(['study note'])).resolves.toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.test/embeddings');
    });

});
