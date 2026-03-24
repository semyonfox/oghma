// splits text into sentence-aligned chunks of ~500 characters for embedding
// no overlap — chunks split at sentence boundaries to preserve coherence

export const chunkText = (text: string, chunkSize = 500): string[] => {
    // Handle empty or whitespace-only text
    if (!text || text.trim().length === 0) {
        return [];
    }

    const sentences = text.split(/(?<=[.?!])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
        if ((current + sentence).length > chunkSize) {
            const trimmed = current.trim();
            if (trimmed) chunks.push(trimmed);
            current = sentence;
        } else {
            current += ' ' + sentence;
        }
    }

    const finalTrimmed = current.trim();
    if (finalTrimmed) chunks.push(finalTrimmed);
    return chunks;
};