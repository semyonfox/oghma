import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedChunks } from '@/lib/embeddings';

describe('embedChunks', () => {
    beforeEach(() => {
        process.env.EMBEDDING_API_URL = 'https://test.api';
        process.env.EMBEDDING_API_KEY = 'fake-key';
        process.env.EMBEDDING_MODEL = 'test-model';
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
});
