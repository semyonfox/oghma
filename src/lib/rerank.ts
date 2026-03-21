/*
 * Reranker — batch ranking via qwen3:8b
 * Sends all candidate chunks in one call to the already-warm chat model.
 * Avoids cold-start entirely since qwen3:8b is always loaded for chat.
 *
 * Falls back to top-N slice if the model returns unparseable output.
 *
 * Note: dedicated reranker (Qwen3-Reranker-4B) times out behind Cloudflare
 * (524 on cold start). Revisit if tunnel readTimeout is ever configured.
 */

import { getOpenWebUIToken, invalidateToken } from './openwebuiAuth';
import logger from '@/lib/logger';

const LLM_URL = process.env.LLM_API_URL;
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen3:8b';
const TOP_N = 3;
const MAX_QUERY_LENGTH = 500;

// patterns that look like prompt injection attempts
const INJECTION_PATTERNS = /^(ignore|system:|assistant:|human:|user:|<\|.*?\|>|###)/im;

/**
 * sanitize user query before embedding in the reranker prompt.
 * strips control chars, truncates, and removes instruction-like lines.
 */
function sanitizeQuery(raw: string): string {
    // strip control characters (keep spaces 0x20, newlines 0x0a, tabs 0x09)
    let cleaned = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    // truncate to max length
    if (cleaned.length > MAX_QUERY_LENGTH) {
        cleaned = cleaned.slice(0, MAX_QUERY_LENGTH);
        logger.warn('reranker: query truncated to %d chars', MAX_QUERY_LENGTH);
    }

    // remove lines that look like injection attempts
    const lines = cleaned.split('\n');
    const safe = lines.filter(line => !INJECTION_PATTERNS.test(line.trim()));
    if (safe.length < lines.length) {
        logger.warn('reranker: stripped %d injection-like lines from query', lines.length - safe.length);
    }
    cleaned = safe.join('\n').trim();

    return cleaned || 'empty query';
}

export async function rerankChunks(query: string, chunks: string[]): Promise<string[]> {
    if (chunks.length <= TOP_N) return chunks;

    const safeQuery = sanitizeQuery(query);
    const numbered = chunks.map((c, i) => `[${i + 1}] ${c.slice(0, 300)}`).join('\n\n');

    const prompt = `You are a relevance ranker. Given a query and a list of passages, return only the indices of the ${TOP_N} most relevant passages in order of relevance, as a comma-separated list like: 3,1,7

<user_query>
${safeQuery}
</user_query>

Passages:
${numbered}

Return only the comma-separated indices, nothing else:`;

    try {
        const token = await getOpenWebUIToken();
        const res = await fetch(`${LLM_URL}/api/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: 'You are a relevance ranker. Reply with only comma-separated numbers. No thinking, no explanation.' },
                    { role: 'user', content: prompt + ' /no_think' },
                ],
                max_tokens: 20,
                temperature: 0,
            }),
        });

        if (res.status === 401) { invalidateToken(); return chunks.slice(0, TOP_N); }
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content ?? '';

        const indices = reply
            .replace(/[^\d,]/g, '')
            .split(',')
            .map((s: string) => parseInt(s, 10) - 1)
            .filter((i: number) => i >= 0 && i < chunks.length);

        if (indices.length === 0) return chunks.slice(0, TOP_N);

        const seen = new Set<number>();
        const ranked: string[] = [];
        for (const i of indices) {
            if (!seen.has(i)) { seen.add(i); ranked.push(chunks[i]); }
            if (ranked.length === TOP_N) break;
        }

        // fill remaining slots if model returned fewer than TOP_N valid indices
        for (let i = 0; i < chunks.length && ranked.length < TOP_N; i++) {
            if (!seen.has(i)) { seen.add(i); ranked.push(chunks[i]); }
        }

        return ranked;
    } catch {
        return chunks.slice(0, TOP_N);
    }
}
