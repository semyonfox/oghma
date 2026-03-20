//Receives the parsed text as a string (output from pdf-parse)
// Splits it into chunks — every 500 characters with some overlap so context isn't lost at the edges
// Returns an array of strings — each string is one chunk

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