// String/Buffer utilities for storage (MIT License - Notea)
// Handles conversion, compression, and JSON parsing

/**
 * Convert various types to Buffer, optionally compressed
 */
export async function toBuffer(raw: unknown, compressed = false): Promise<Buffer> {
  if (!raw) {
    return Buffer.alloc(0);
  }

  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const finalStr = compressed ? await strCompress(str) : str;
  return Buffer.from(finalStr, 'utf-8');
}

/**
 * Convert Buffer or string to string, optionally decompressed
 */
export async function toStr(
  bufferOrString?: Buffer | string | null,
  deCompressed = false
): Promise<string | undefined> {
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
  } catch {
    console.error("storage_json_invalid");
    return null;
  }
}

/**
 * Decompress a Base64-encoded string using native DecompressionStream
 */
export async function strDecompress(raw?: string | null): Promise<string | undefined> {
  if (!raw) return undefined;

  try {
    const binaryString = atob(raw);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const buf = await new Response(stream.readable).arrayBuffer();
    return new TextDecoder().decode(buf);
  } catch {
    console.error("storage_decompression_failed");
    return undefined;
  }
}

/**
 * Compress a string to Base64-encoded format using native CompressionStream
 */
export async function strCompress(str?: string): Promise<string> {
  if (!str) return '';

  try {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();

    const buf = await new Response(stream.readable).arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  } catch {
    console.error("storage_compression_failed");
    return str; // fallback to original string if compression fails
  }
}
