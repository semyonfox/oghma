import { describe, it, expect, vi } from 'vitest';

vi.mock('@/database/pgsql', () => ({ default: vi.fn() }));
vi.mock('@/lib/rag/embeddings', () => ({ embedText: vi.fn() }));
vi.mock('@/lib/qdrant', () => ({ searchChunkVectors: vi.fn() }));

import sql from '@/database/pgsql';
import { embedText } from '@/lib/rag/embeddings';
import {
    allocateSlots,
    resolveChunkIds,
    getSessionCandidates,
    selectCards,
    sessionCardIds,
    type CandidateCard,
} from '@/lib/quiz/select';

function cards(prefix: string, count: number, due = new Date(Date.now() - 1000)): CandidateCard[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        due: due.toISOString(),
        state: 'review',
        last_review: null,
    }));
}

const none: CandidateCard[] = [];

describe('slot allocation', () => {
    it('uses the 70/20/10 split when every bucket is deep enough', () => {
        expect(allocateSlots([50, 50, 50], 20)).toEqual([14, 4, 2]);
    });

    it('backfills unused slots in priority order', () => {
        expect(allocateSlots([3, 50, 50], 20)).toEqual([3, 15, 2]);
        expect(allocateSlots([0, 0, 15], 5)).toEqual([0, 0, 5]);
    });

    it('never exceeds the session size', () => {
        for (const max of [1, 3, 7, 10, 20, 50]) {
            const [due, fresh, retention] = allocateSlots([100, 100, 100], max);
            expect(due + fresh + retention).toBe(max);
        }
    });

    it('never allocates more than a bucket holds', () => {
        expect(allocateSlots([1, 0, 0], 20)).toEqual([1, 0, 0]);
    });
});

describe('card selection', () => {
    it('returns empty buckets when nothing is available', () => {
        expect(selectCards({ dueCards: none, newCards: none, retentionCards: none }, 20))
            .toEqual({ due: [], new: [], retention: [] });
    });

    it('fills the whole session from unseen cards when little is due', () => {
        // regression: the new-card share used to be reserved for chunks with no
        // card yet, which a session can never serve, so sessions came up short
        const result = selectCards(
            { dueCards: cards('due', 3), newCards: cards('new', 30), retentionCards: none },
            20,
        );
        expect(sessionCardIds(result, 20)).toHaveLength(20);
        expect(result.due).toHaveLength(3);
        expect(result.new).toHaveLength(17);
    });

    it('sorts due cards earliest-due first (most overdue first)', () => {
        const now = Date.now();
        const dueCards: CandidateCard[] = [
            { id: 'c1', due: new Date(now - 1000).toISOString(), state: 'review', last_review: null },
            { id: 'c3', due: new Date(now - 100000).toISOString(), state: 'review', last_review: null },
            { id: 'c2', due: new Date(now - 50000).toISOString(), state: 'review', last_review: null },
        ];
        const result = selectCards({ dueCards, newCards: none, retentionCards: none }, 3);
        expect(result.due.map(({ id }) => id)).toEqual(['c3', 'c2', 'c1']);
    });

    it('does not reorder the caller-owned due-card list', () => {
        const dueCards: CandidateCard[] = [
            { id: 'later', due: '2025-01-02T00:00:00.000Z', state: 'review', last_review: null },
            { id: 'earlier', due: '2025-01-01T00:00:00.000Z', state: 'review', last_review: null },
        ];

        selectCards({ dueCards, newCards: none, retentionCards: none }, 2);

        expect(dueCards.map(({ id }) => id)).toEqual(['later', 'earlier']);
    });

    it('orders the session as due, then new, then retention', () => {
        const result = selectCards(
            { dueCards: cards('due', 1), newCards: cards('new', 1), retentionCards: cards('ret', 1) },
            10,
        );
        expect(sessionCardIds(result, 10)).toEqual(['due-0', 'new-0', 'ret-0']);
    });
});

describe('session candidates', () => {
    it('buckets cards by FSRS state and reports chunks without a card', async () => {
        const now = new Date('2026-10-06T12:00:00.000Z');
        const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
        const card = (id: string, state: CandidateCard['state'], due: string, lastReview: string | null) => ({
            id, state, due, last_review: lastReview, chunk_id: `chunk-${id}`,
        });
        vi.mocked(sql)
            .mockResolvedValueOnce([
                card('new', 'new', hoursAgo(1), null),
                card('due', 'learning', hoursAgo(1), hoursAgo(2)),
                card('learning-soon', 'learning', hoursAgo(-1), hoursAgo(0.1)),
                card('fresh-review', 'review', hoursAgo(-48), hoursAgo(1)),
                card('old-review', 'review', hoursAgo(-48), hoursAgo(48)),
            ] as never)
            .mockResolvedValueOnce([{ id: 'chunk-new' }, { id: 'chunk-uncovered' }] as never);

        const result = await getSessionCandidates('user-1', ['chunk-new', 'chunk-uncovered'], now);

        expect(result.newCards.map(({ id }) => id)).toEqual(['new']);
        expect(result.dueCards.map(({ id }) => id)).toEqual(['due']);
        // a card reviewed an hour ago is not worth a retention check yet
        expect(result.retentionCards.map(({ id }) => id)).toEqual(['old-review']);
        expect(result.uncoveredChunkIds).toEqual(['chunk-uncovered']);
    });
});

describe('search filter', () => {
    // a quiz on "graphs" should still start while embeddings or Qdrant are down
    it('falls back to a literal chunk match when semantic search fails', async () => {
        vi.mocked(embedText).mockRejectedValue(new Error('embedding timeout'));
        vi.mocked(sql).mockReset();
        vi.mocked(sql).mockResolvedValue([{ id: 'chunk-1' }] as never);

        await expect(
            resolveChunkIds('user-1', { filterType: 'search', filterValue: '100%_graphs' }),
        ).resolves.toEqual(['chunk-1']);

        const [parts, ...values] = vi.mocked(sql).mock.calls[0];
        expect(Array.from(parts as TemplateStringsArray).join('')).toContain('c.text ILIKE');
        // LIKE wildcards in the query are matched literally
        expect(values).toContain('%100\\%\\_graphs%');
    });
});
