import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedChunks } from '@/lib/embeddings';

describe('embedChunks', () => {
    beforeEach(() => {
        process.env.COHERE_API_KEY = 'test-key';
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

    it('filters out batches where the API call fails', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        );

        const result = await embedChunks(['bad chunk', 'good chunk']);
        expect(result).toHaveLength(0);
    });

    it('filters out batches where the response has no embeddings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ notEmbeddings: 'oops' }),
        }));

        const result = await embedChunks(['chunk one']);
        expect(result).toHaveLength(0);
    });

    it('filters out batches that throw during fetch', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockRejectedValueOnce(new Error('network error'))
        );

        const result = await embedChunks(['failing chunk', 'working chunk']);
        expect(result).toHaveLength(0);
    });
});
