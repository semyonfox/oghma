/**
 * Canvas Text Processing
 *
 * Cleans raw text extracted from PDFs before it is stored as extracted_text in the database and before it is chunked for embeddings.
 *
 * The goal is to strip noise that would pollute search results and degrade embedding quality — stop words, pure numbers, single characters,
 * and non-alphabetic symbols that come from PDF formatting artefacts.
 */

/**
 * Common English stop words that carry no semantic value for search or embeddings.
 * Using a Set for O(1) lookup since this is called on every token in a document.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'as', 'up', 'if', 'so', 'no', 'not',
  'than', 'then', 'their', 'there', 'they', 'we', 'he', 'she', 'his',
  'her', 'our', 'your', 'my', 'i', 'you', 'also', 'about', 'into',
  'which', 'when', 'where', 'who', 'how', 'all', 'each', 'any', 'both',
  'more', 'some', 'such', 'only', 'same', 'other', 'just', 'over',
  'after', 'before', 'between', 'through', 'during', 'while',
]);

/**
 * Cleans raw extracted text from a PDF for storage and embedding.
 *
 * Steps:
 * 1. Normalise line endings and tabs
 * 2. Split into tokens (words)
 * 3. Filter out stop words, pure numbers, single characters, and symbol-only tokens
 * 4. Rejoin and collapse extra whitespace
 *
 * @param {string} raw - Raw text string from pdf-parse
 * @returns {string} - Cleaned text ready for storage and chunking
 */
export function processExtractedText(raw) {
  return raw
    // Normalise Windows line endings and tabs before splitting
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')

    // Split on any whitespace to get individual tokens
    .split(/\s+/)
    .filter(token => {
      if (!token) return false;

      const lower = token.toLowerCase();

      // Drop common English words with no semantic value
      if (STOP_WORDS.has(lower)) return false;

      // Drop pure numbers — page numbers, years, slide numbers etc.
      if (/^\d+$/.test(token)) return false;

      // Drop single characters — stray letters from PDF parsing artefacts
      if (token.length < 2) return false;

      // Drop tokens with no letters at all — "---", "...", "###", "()" etc.
      // These come from slide decorations and PDF formatting
      if (/^[^a-zA-Z]+$/.test(token)) return false;

      return true;
    })
    .join(' ')

    // Collapse any multiple spaces left over after filtering
    .replace(/ {2,}/g, ' ')
    .trim();
}
