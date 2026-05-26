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

    const pushLongSegment = (segment: string) => {
        let piece = segment.trim();
        while (piece.length > chunkSize) {
            const window = piece.slice(0, chunkSize);
            const splitAt = Math.max(
                window.lastIndexOf('\n'),
                window.lastIndexOf(' '),
            );
            const end = splitAt > chunkSize * 0.5 ? splitAt : chunkSize;
            const chunk = piece.slice(0, end).trim();
            if (chunk) chunks.push(chunk);
            piece = piece.slice(end).trim();
        }
        if (piece) chunks.push(piece);
    };

    for (const sentence of sentences) {
        if (sentence.length > chunkSize) {
            const trimmed = current.trim();
            if (trimmed) chunks.push(trimmed);
            current = '';
            pushLongSegment(sentence);
            continue;
        }

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
