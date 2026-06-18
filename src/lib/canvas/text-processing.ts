/**
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
 * @param raw - Raw text string from pdf-parse
 * @returns cleaned text ready for storage and chunking
 */
export function processExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split(/\s+/)
    .filter((token) => {
      if (!token) {
        return false;
      }
      if (token.length < 2) {
        return false;
      }
      if (/^[^a-zA-Z]+$/.test(token)) {
        return false;
      }
      return true;
    })
    .join(" ")
    .replace(/ {2,}/g, " ")
    .trim();
}
