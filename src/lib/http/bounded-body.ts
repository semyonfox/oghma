export class BodyTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`Body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
  }
}

// count actual bytes, including chunked bodies and dishonest content-length headers
export async function readBoundedBody(
  input: Pick<Request, "headers" | "body">,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new RangeError("Invalid body limit");
  const declared = input.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await input.body?.cancel();
    throw new BodyTooLargeError(limit);
  }
  if (!input.body) return new Uint8Array();
  const reader = input.body.getReader();
  let bytes = new Uint8Array(0);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > limit - total) throw new BodyTooLargeError(limit);
      const next = total + value.byteLength;
      if (next > bytes.byteLength) {
        // retain one growing buffer so tiny input chunks cannot create an object backlog
        const capacity = Math.min(
          limit,
          Math.max(next, bytes.byteLength * 2, 1024),
        );
        const grown = new Uint8Array(capacity);
        grown.set(bytes.subarray(0, total));
        bytes = grown;
      }
      bytes.set(value, total);
      total = next;
    }
    return total === bytes.byteLength ? bytes : bytes.slice(0, total);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
