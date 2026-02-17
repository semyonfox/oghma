// String/Buffer utilities for storage (MIT License - Notea)
// Handles conversion, compression, and JSON parsing

import { compress, decompress } from 'lzutf8';

/**
 * Convert various types to Buffer, optionally compressed
 */
export function toBuffer(raw: unknown, compressed = false): Buffer {
  if (!raw) {
    return Buffer.alloc(0);
  }

  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return Buffer.from(compressed ? strCompress(str) : str, 'utf-8');
}

/**
 * Convert Buffer or string to string, optionally decompressed
 */
export function toStr(
  bufferOrString?: Buffer | string | null,
  deCompressed = false
): string | undefined {
  if (!bufferOrString) return undefined;

  const str = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('utf-8')
    : bufferOrString;

  return deCompressed ? strDecompress(str) : str;
}

/**
 * Safely parse JSON string with error handling
 * @returns Parsed object or null if parsing fails
 */
export function tryJSON<T>(str?: string | null): T | null {
  if (!str) return null;

  try {
    return JSON.parse(str) as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse JSON: ${errorMsg}`, { input: str.slice(0, 100) });
    return null;
  }
}

/**
 * Decompress a Base64-encoded string
 */
export function strDecompress(raw?: string | null): string | undefined {
  if (!raw) return undefined;

  try {
    return decompress(raw, { inputEncoding: 'Base64' });
  } catch (error) {
    console.error('Failed to decompress string:', error);
    return undefined;
  }
}

/**
 * Compress a string to Base64-encoded format
 */
export function strCompress(str?: string): string {
  if (!str) return '';

  try {
    return compress(str, { outputEncoding: 'Base64' });
  } catch (error) {
    console.error('Failed to compress string:', error);
    return str; // fallback to original string if compression fails
  }
}
