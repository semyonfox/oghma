// Stream utilities for storage (MIT License - Notea)
// Converts Node.js streams to Buffers

import { Readable } from 'stream';

/**
 * Convert a readable stream to a Buffer
 * Accumulates all chunks and returns concatenated buffer
 *
 * @param stream - Readable stream to convert
 * @returns Promise resolving to concatenated Buffer
 * @throws If stream emits error event
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk);
    });

    stream.on('error', (error: Error) => {
      reject(new Error(`Stream conversion failed: ${error.message}`));
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
