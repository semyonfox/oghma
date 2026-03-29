/**
 * Canvas Text Processing
 *
 * Cleans raw text extracted from PDFs before it is stored as extracted_text
 * in the database and before it is chunked for embeddings.
 *
 * Only strips PDF formatting artefacts (decoration symbols, stray single
 * characters). Stop words are intentionally preserved — embedding models
 * rely on surrounding context ("the algorithm is efficient" embeds
 * differently from "algorithm efficient") and removing them degrades
 * retrieval quality.
 */

/**
 * Cleans raw extracted text from a PDF for storage and embedding.
 *
 * Steps:
 * 1. Normalise line endings and tabs
 * 2. Split into tokens (words)
 * 3. Filter out single-character artefacts and symbol-only tokens
 * 4. Rejoin and collapse extra whitespace
 *
 * @param {string} raw - Raw text string from pdf-parse
 * @returns {string} - Cleaned text ready for storage and chunking
 */
export function processExtractedText(raw) {
  return raw
    // normalise Windows line endings and tabs before splitting
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')

    // split on any whitespace to get individual tokens
    .split(/\s+/)
    .filter(token => {
      if (!token) return false;

      // drop single characters — stray letters from PDF parsing artefacts
      if (token.length < 2) return false;

      // drop tokens with no letters at all — "---", "...", "###", "()" etc.
      // these come from slide decorations and PDF formatting
      if (/^[^a-zA-Z]+$/.test(token)) return false;

      return true;
    })
    .join(' ')

    // collapse any multiple spaces left over after filtering
    .replace(/ {2,}/g, ' ')
    .trim();
}
