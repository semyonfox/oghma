// extracted from Notea (MIT License)
// original: libs/server/store/utils.ts

import { Readable } from 'stream';

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }
  return await new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
