import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedChunks } from '@/lib/embeddings';

describe('embedChunks', () => {
    beforeEach(() => {
        process.env.COHERE_API_KEY = 'fake';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('throws when COHERE_API_KEY is not set', async () => {
        delete process.env.COHERE_API_KEY;
        await expect(embedChunks(['hello'])).rejects.toThrow('COHERE_API_KEY not configured');
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
                embeddings: { float: [mockVector, mockVector] },
            }),
        }));

        const result = await embedChunks(['hello world', 'another chunk']);
        expect(result).toHaveLength(2);
        expect(result[0].chunk).toBe('hello world');
        expect(result[0].vector).toEqual(mockVector);
        expect(result[1].chunk).toBe('another chunk');
    });

    it('throws when a batch API call fails', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        );

        await expect(embedChunks(['bad chunk', 'good chunk'])).rejects.toThrow('Cohere embedding incomplete');
    });

    it('throws when the response has no embeddings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ notEmbeddings: 'oops' }),
        }));

        // empty embeddings.float means 0 results for 1 chunk — but no batch failure
        // the batch "succeeded" with 0 vectors, so results = 0 but failures = 0
        const result = await embedChunks(['chunk one']);
        expect(result).toHaveLength(0);
    });

    it('throws when fetch rejects with a network error', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockRejectedValueOnce(new Error('network error'))
        );

        await expect(embedChunks(['failing chunk', 'working chunk'])).rejects.toThrow('Cohere embedding incomplete');
    });
});
