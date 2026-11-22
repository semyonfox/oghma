/**
 * The central directory supplies offsets and compressed sizes. Read the file
 * data in offset order so a nested ZIP signature can never start an entry.
 */

import { closeSync, mkdtempSync, openSync, writeSync } from "node:fs";
import { readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createInflateRaw } from "node:zlib";
import { shouldIgnore, sanitizePath, VaultImportCancelledError } from "./tree-builder";

export class VaultUserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VaultUserError";
  }
}

function damagedZip(cause?: unknown): VaultUserError {
  return new VaultUserError("The ZIP is damaged or uses unsupported compression", { cause });
}

function formatMegabytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${Math.round(bytes / 1024 ** 3)}GB`
    : `${Math.round(bytes / 1024 ** 2)}MB`;
}

const FILE_CONCURRENCY = 5;
const END_RECORD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_END_SIZE = 56;
const DIRECTORY_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const UNSUPPORTED_FLAGS = 0x0001 | 0x0020 | 0x0040 | 0x2000;

const VAULT_ZIP_LIMITS = {
  maxEntryBytes: 250 * 1024 * 1024,
  maxStagedBytes: 512 * 1024 * 1024,
  maxDecompressedBytes: 20 * 1024 * 1024 * 1024,
  maxEntries: 50_000,
  maxPendingEntries: 512,
};

export type VaultZipLimits = typeof VAULT_ZIP_LIMITS;

export interface VaultZipSource {
  size: number;
  openRange(start: number, endExclusive: number): Promise<Readable>;
}

class ZipRangeReader {
  private readonly chunks: AsyncIterator<unknown>;
  private buffered: Buffer = Buffer.alloc(0);

  constructor(
    body: Readable,
    public offset: number,
    private readonly end: number,
    private readonly checkActive: () => void,
  ) {
    this.chunks = body[Symbol.asyncIterator]();
  }

  async *take(size: number): AsyncGenerator<Buffer> {
    if (size < 0 || size > this.end - this.offset) throw damagedZip();
    const stop = this.offset + size;
    while (this.offset < stop) {
      this.checkActive();
      if (this.buffered.length === 0) {
        const next = await this.chunks.next();
        if (next.done || !(next.value instanceof Uint8Array)) throw damagedZip();
        this.buffered = Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength);
        continue;
      }
      const length = Math.min(stop - this.offset, this.buffered.length);
      const part = this.buffered.subarray(0, length);
      this.buffered = this.buffered.subarray(length);
      this.offset += length;
      yield part;
    }
  }

  async read(size: number): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(size);
    let written = 0;
    for await (const chunk of this.take(size)) {
      written += chunk.copy(buffer, written);
    }
    return buffer;
  }

  async skip(size: number): Promise<void> {
    const chunks = this.take(size);
    while (!(await chunks.next()).done) {
      // discard padding, descriptors and unused metadata
    }
  }
}

function readUInt64(buffer: Buffer, offset: number): number {
  if (offset + 8 > buffer.length) throw damagedZip();
  const value = Number(buffer.readBigUInt64LE(offset));
  if (!Number.isSafeInteger(value)) throw damagedZip();
  return value;
}

async function readRange(
  source: VaultZipSource,
  start: number,
  end: number,
  checkActive: () => void,
): Promise<Buffer> {
  checkActive();
  const stream = await source.openRange(start, end);
  try {
    return await new ZipRangeReader(stream, start, end, checkActive).read(end - start);
  } finally {
    stream.destroy();
  }
}

async function directoryLocation(source: VaultZipSource, checkActive: () => void) {
  if (!Number.isSafeInteger(source.size) || source.size < END_RECORD_SIZE) {
    throw new VaultUserError("Uploaded object is not a ZIP file");
  }
  const tailStart = Math.max(0, source.size - END_RECORD_SIZE - UINT16_MAX - ZIP64_LOCATOR_SIZE);
  const tail = await readRange(source, tailStart, source.size, checkActive);
  for (let i = tail.length - END_RECORD_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== 0x06054b50 || i + END_RECORD_SIZE + tail.readUInt16LE(i + 20) !== tail.length) {
      continue;
    }

    const disk = tail.readUInt16LE(i + 4);
    const directoryDisk = tail.readUInt16LE(i + 6);
    const countOnDisk = tail.readUInt16LE(i + 8);
    let count = tail.readUInt16LE(i + 10);
    let length = tail.readUInt32LE(i + 12);
    let offset = tail.readUInt32LE(i + 16);
    let directoryEnd = tailStart + i;

    const locator = i - ZIP64_LOCATOR_SIZE;
    const regularRecord = disk === 0 && directoryDisk === 0 && countOnDisk === count &&
      count !== UINT16_MAX && length !== UINT32_MAX && offset !== UINT32_MAX &&
      length === directoryEnd - offset;
    if (!regularRecord) {
      if (
        locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50 ||
        tail.readUInt32LE(locator + 4) !== 0 || tail.readUInt32LE(locator + 16) !== 1
      ) throw damagedZip();
      const zip64Offset = readUInt64(tail, locator + 8);
      const locatorOffset = tailStart + locator;
      if (zip64Offset + ZIP64_END_SIZE > locatorOffset) throw damagedZip();
      const record = zip64Offset >= tailStart
        ? tail.subarray(zip64Offset - tailStart, zip64Offset - tailStart + ZIP64_END_SIZE)
        : await readRange(source, zip64Offset, zip64Offset + ZIP64_END_SIZE, checkActive);
      if (
        record.readUInt32LE(0) !== 0x06064b50 ||
        readUInt64(record, 4) !== locatorOffset - zip64Offset - 12 ||
        record.readUInt32LE(16) !== 0 || record.readUInt32LE(20) !== 0 ||
        readUInt64(record, 24) !== readUInt64(record, 32)
      ) throw damagedZip();
      count = readUInt64(record, 32);
      length = readUInt64(record, 40);
      offset = readUInt64(record, 48);
      directoryEnd = zip64Offset;
    }
    if (length !== directoryEnd - offset || count > Math.floor(length / DIRECTORY_HEADER_SIZE)) throw damagedZip();
    return { count, offset, length };
  }
  throw new VaultUserError("Uploaded object is not a ZIP file");
}

interface ZipEntry {
  nameLength: number;
  nameCrc: number;
  flags: number;
  method: number;
  crc: number;
  offset: number;
  compressed: number;
  uncompressed: number;
}

function centralEntryLocation(header: Buffer, extra: Buffer, directoryOffset: number) {
  let compressed = header.readUInt32LE(20);
  let uncompressed = header.readUInt32LE(24);
  let offset = header.readUInt32LE(42);
  let disk = header.readUInt16LE(34);

  if (compressed === UINT32_MAX || uncompressed === UINT32_MAX || offset === UINT32_MAX || disk === UINT16_MAX) {
    let zip64: Buffer | undefined;
    for (let i = 0; i + 4 <= extra.length;) {
      const type = extra.readUInt16LE(i);
      const length = extra.readUInt16LE(i + 2);
      const next = i + 4 + length;
      if (next > extra.length) throw damagedZip();
      if (type === 1) {
        zip64 = extra.subarray(i + 4, next);
        break;
      }
      i = next;
    }
    if (!zip64) throw damagedZip();
    // zip64 includes only the fields marked with sentinel values in the header
    let cursor = 0;
    if (uncompressed === UINT32_MAX) {
      uncompressed = readUInt64(zip64, cursor);
      cursor += 8;
    }
    if (compressed === UINT32_MAX) {
      compressed = readUInt64(zip64, cursor);
      cursor += 8;
    }
    if (offset === UINT32_MAX) {
      offset = readUInt64(zip64, cursor);
      cursor += 8;
    }
    if (disk === UINT16_MAX) {
      if (cursor + 4 > zip64.length) throw damagedZip();
      disk = zip64.readUInt32LE(cursor);
    }
  }

  if (disk !== 0 || compressed > directoryOffset - offset - LOCAL_HEADER_SIZE) throw damagedZip();
  return { offset, compressed, uncompressed };
}

async function readDirectory(
  source: VaultZipSource,
  directory: Awaited<ReturnType<typeof directoryLocation>>,
  checkActive: () => void,
): Promise<ZipEntry[]> {
  if (directory.length === 0) return [];
  const end = directory.offset + directory.length;
  checkActive();
  const stream = await source.openRange(directory.offset, end);
  const reader = new ZipRangeReader(stream, directory.offset, end, checkActive);
  try {
    const entries: ZipEntry[] = [];
    for (let i = 0; i < directory.count; i++) {
      const header = await reader.read(DIRECTORY_HEADER_SIZE);
      if (header.readUInt32LE(0) !== 0x02014b50) throw damagedZip();
      const flags = header.readUInt16LE(8);
      const method = header.readUInt16LE(10);
      if ((flags & UNSUPPORTED_FLAGS) || (method !== 0 && method !== 8)) throw damagedZip();
      const nameLength = header.readUInt16LE(28);
      const nameBytes = await reader.read(nameLength);
      const extra = await reader.read(header.readUInt16LE(30));
      await reader.skip(header.readUInt16LE(32));
      entries.push({
        nameLength,
        nameCrc: crc32(nameBytes),
        flags,
        method,
        crc: header.readUInt32LE(16),
        ...centralEntryLocation(header, extra, directory.offset),
      });
    }
    if (reader.offset !== end) {
      const signature = await reader.read(6);
      if (signature.readUInt32LE(0) !== 0x05054b50 || signature.readUInt16LE(4) !== end - reader.offset) throw damagedZip();
      await reader.skip(end - reader.offset);
    }
    return entries.sort((a, b) => a.offset - b.offset);
  } finally {
    stream.destroy();
  }
}

async function readLocalHeader(reader: ZipRangeReader, entry: ZipEntry, nextOffset: number) {
  if (entry.offset + LOCAL_HEADER_SIZE > nextOffset) throw damagedZip();
  await reader.skip(entry.offset - reader.offset);
  const header = await reader.read(LOCAL_HEADER_SIZE);
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  if (
    header.readUInt32LE(0) !== 0x04034b50 ||
    header.readUInt16LE(6) !== entry.flags ||
    header.readUInt16LE(8) !== entry.method ||
    nameLength !== entry.nameLength ||
    entry.compressed > nextOffset - reader.offset - nameLength - extraLength
  ) throw damagedZip();
  const nameBytes = await reader.read(nameLength);
  if (crc32(nameBytes) !== entry.nameCrc) throw damagedZip();
  await reader.skip(extraLength);
  const name = nameBytes.toString(entry.flags & 0x800 ? "utf8" : "latin1");
  return /[/\\]$/.test(name) || shouldIgnore(name) ? null : sanitizePath(name);
}

async function inflateEntry(
  entry: ZipEntry,
  compressed: AsyncIterable<Buffer>,
  write: (chunk: Buffer) => void,
): Promise<void> {
  let size = 0;
  let crc = 0;
  const consume = async (chunks: AsyncIterable<unknown>) => {
    for await (const chunk of chunks) {
      if (!Buffer.isBuffer(chunk) || chunk.length > entry.uncompressed - size) throw damagedZip();
      size += chunk.length;
      crc = crc32(chunk, crc);
      write(chunk);
    }
  };
  if (entry.method === 8) {
    const inflate = createInflateRaw();
    try {
      await pipeline(compressed, inflate, consume);
    } catch (error) {
      if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("Z_")) {
        throw damagedZip(error);
      }
      throw error;
    }
    if (inflate.bytesWritten !== entry.compressed) throw damagedZip();
  } else {
    await consume(compressed);
  }
  if (size !== entry.uncompressed || crc !== entry.crc) throw damagedZip();
}

/** Read indexed members without retaining the archive or a backlog of buffers. */
export async function processVaultZipStream(
  source: VaultZipSource,
  processEntry: (entryPath: string, buffer: Buffer) => Promise<void>,
  requestedLimits: Partial<VaultZipLimits> = {},
  isCancelled: () => boolean = () => false,
): Promise<number> {
  const limits = { ...VAULT_ZIP_LIMITS, ...requestedLimits };
  // callers may tighten these bounds, never loosen them
  for (const key of Object.keys(VAULT_ZIP_LIMITS) as Array<keyof VaultZipLimits>) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > VAULT_ZIP_LIMITS[key]) {
      throw new Error(`Invalid ZIP limit: ${key}`);
    }
  }
  const checkActive = () => {
    if (isCancelled()) throw new VaultImportCancelledError();
  };
  const directory = await directoryLocation(source, checkActive);
  if (directory.count > limits.maxEntries) {
    throw new VaultUserError(`The ZIP has more than ${limits.maxEntries} files`);
  }
  const entries = await readDirectory(source, directory, checkActive);
  if (entries.length === 0) return 0;

  const stagingDir = mkdtempSync(join(tmpdir(), "oghma-vault-import-"));
  const pending: Array<{ name: string; path: string }> = [];
  let entryCount = 0;
  let totalSize = 0;
  let stagedBytes = 0;

  const drain = async () => {
    if (pending.length === 0) return;
    checkActive();
    // settle every active callback before cleanup or reporting a failure
    const results = await Promise.allSettled(pending.map(async ({ name, path }) => {
      try {
        await processEntry(name, await readFile(path));
      } finally {
        await unlink(path);
      }
    }));
    pending.length = 0;
    stagedBytes = 0;
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  };

  try {
    checkActive();
    const stream = await source.openRange(entries[0].offset, directory.offset);
    const reader = new ZipRangeReader(stream, entries[0].offset, directory.offset, checkActive);
    try {
      for (const [index, entry] of entries.entries()) {
        checkActive();
        if (entry.uncompressed > limits.maxEntryBytes) {
          throw new VaultUserError(`A file in the ZIP is larger than ${formatMegabytes(limits.maxEntryBytes)}`);
        }
        if (entry.uncompressed > limits.maxDecompressedBytes - totalSize) {
          throw new VaultUserError(`The ZIP expands to more than ${formatMegabytes(limits.maxDecompressedBytes)}`);
        }
        if (pending.length >= Math.min(FILE_CONCURRENCY, limits.maxPendingEntries)) {
          await drain();
          checkActive();
        }
        const nextOffset = entries[index + 1]?.offset ?? directory.offset;
        const name = await readLocalHeader(reader, entry, nextOffset);
        if (name && entry.uncompressed > limits.maxStagedBytes) {
          throw new VaultUserError("The ZIP expands too quickly to import safely");
        }
        if (name && entry.uncompressed > Math.min(limits.maxEntryBytes, limits.maxStagedBytes) - stagedBytes) {
          await drain();
          checkActive();
        }

        const path = join(stagingDir, String(index));
        const fd = name ? openSync(path, "wx", 0o600) : null;
        try {
          await inflateEntry(entry, reader.take(entry.compressed), (chunk) => {
            checkActive();
            if (fd === null) return;
            for (let written = 0; written < chunk.length;) {
              const count = writeSync(fd, chunk, written, chunk.length - written);
              if (!count) throw new Error("Could not write ZIP staging file");
              written += count;
            }
          });
        } finally {
          if (fd !== null) closeSync(fd);
        }
        totalSize += entry.uncompressed;
        if (name) {
          pending.push({ name, path });
          stagedBytes += entry.uncompressed;
          entryCount++;
        }
      }
      await drain();
      return entryCount;
    } finally {
      stream.destroy();
    }
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}
