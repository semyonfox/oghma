import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedChunks } from '@/lib/embeddings';

// EMBEDDING_API_URL is set to http://localhost:11434 in setup.ts

describe('embedChunks', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        // restore in case a test deleted it
        process.env.EMBEDDING_API_URL = 'http://localhost:11434';
    });

    it('throws when EMBEDDING_API_URL is not set', async () => {
        const original = process.env.EMBEDDING_API_URL;
        delete process.env.EMBEDDING_API_URL;
        await expect(embedChunks(['hello'])).rejects.toThrow('Embedding API URL not configured');
        process.env.EMBEDDING_API_URL = original;
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
            json: async () => ({ vector: mockVector }),
        }));

        const result = await embedChunks(['hello world', 'another chunk']);
        expect(result).toHaveLength(2);
        expect(result[0].chunk).toBe('hello world');
        expect(result[0].vector).toEqual(mockVector);
        expect(result[1].chunk).toBe('another chunk');
    });

    it('filters out chunks where the API call fails', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ vector: [0.5, 0.6] }) })
        );

        const result = await embedChunks(['bad chunk', 'good chunk']);
        expect(result).toHaveLength(1);
        expect(result[0].chunk).toBe('good chunk');
    });

    it('filters out chunks where the response has no vector field', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ notAVector: 'oops' }),
        }));

        const result = await embedChunks(['chunk one']);
        expect(result).toHaveLength(0);
    });

    it('filters out chunks that throw during fetch', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockRejectedValueOnce(new Error('network error'))
            .mockResolvedValueOnce({ ok: true, json: async () => ({ vector: [1, 2, 3] }) })
        );

        const result = await embedChunks(['failing chunk', 'working chunk']);
        expect(result).toHaveLength(1);
        expect(result[0].chunk).toBe('working chunk');
    });
});
