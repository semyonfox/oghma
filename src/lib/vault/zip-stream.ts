/**
 * Streaming ZIP reader for vault imports. This is the security boundary for
 * untrusted archives: entry names never touch the filesystem (entries are
 * staged under numbered temp files), and every limit is enforced on actual
 * inflated bytes rather than on sizes the archive claims.
 */

import { UnzipInflate, Unzip } from "fflate";
import { closeSync, mkdtempSync, openSync, writeSync } from "node:fs";
import { readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  shouldIgnore,
  sanitizePath,
  VaultImportCancelledError,
} from "./tree-builder";

export class VaultUserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VaultUserError";
  }
}

function formatMegabytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${Math.round(bytes / 1024 ** 3)}GB`
    : `${Math.round(bytes / 1024 ** 2)}MB`;
}

const FILE_CONCURRENCY = 5;
const MAX_DECOMPRESSED_SIZE = 20 * 1024 * 1024 * 1024; // 20GB
const MAX_ENTRIES = 50_000;
const MAX_ENTRY_BYTES = 250 * 1024 * 1024;
const MAX_STAGED_BYTES = 512 * 1024 * 1024;
const ZIP_INPUT_SLICE_BYTES = 4 * 1024;
const MAX_PENDING_ENTRIES = 512;

export interface VaultZipLimits {
  maxEntryBytes: number;
  maxStagedBytes: number;
  maxDecompressedBytes: number;
  maxEntries: number;
  maxPendingEntries: number;
}

const VAULT_ZIP_LIMITS: VaultZipLimits = {
  maxEntryBytes: MAX_ENTRY_BYTES,
  maxStagedBytes: MAX_STAGED_BYTES,
  maxDecompressedBytes: MAX_DECOMPRESSED_SIZE,
  maxEntries: MAX_ENTRIES,
  maxPendingEntries: MAX_PENDING_ENTRIES,
};

/** Process ZIP bytes without retaining an archive or completed-file backlog. */
export async function processVaultZipStream(
  source: AsyncIterable<Uint8Array>,
  processEntry: (entryPath: string, buffer: Buffer) => Promise<void>,
  requestedLimits: Partial<VaultZipLimits> = {},
  isCancelled: () => boolean = () => false,
): Promise<number> {
  const limits = { ...VAULT_ZIP_LIMITS, ...requestedLimits };
  // callers may tighten these bounds, never loosen them
  for (const key of Object.keys(VAULT_ZIP_LIMITS) as Array<keyof VaultZipLimits>) {
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] <= 0 ||
      limits[key] > VAULT_ZIP_LIMITS[key]
    ) {
      throw new Error(`Invalid ZIP limit: ${key}`);
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "oghma-vault-import-"));
  const openFiles = new Set<number>();
  const pending: Array<{ name: string; path: string; size: number }> = [];
  let entryCount = 0;
  let archiveEntryCount = 0;
  let totalSize = 0;
  let stagedBytes = 0;
  let unfinishedEntries = 0;
  let failure: Error | null = null;
  let header = Buffer.alloc(0);
  let zipSignatureChecked = false;

  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new Error(String(error));
  };
  const unzip = new Unzip((stream) => {
    if (failure) return;
    archiveEntryCount++;
    if (archiveEntryCount > limits.maxEntries) {
      fail(new VaultUserError(`The ZIP has more than ${limits.maxEntries} files`));
      return;
    }
    if (stream.originalSize !== undefined && stream.originalSize > limits.maxEntryBytes) {
      fail(new VaultUserError(`A file in the ZIP is larger than ${formatMegabytes(limits.maxEntryBytes)}`));
      return;
    }
    const ignored =
      stream.name.endsWith("/") ||
      !sanitizePath(stream.name) ||
      shouldIgnore(stream.name);
    let entrySize = 0;
    let fd: number | null = null;
    const path = join(directory, String(archiveEntryCount));
    if (!ignored) {
      entryCount++;
      fd = openSync(path, "wx", 0o600);
      openFiles.add(fd);
    }
    unfinishedEntries++;
    stream.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        // fflate reports corrupt data, encryption and unsupported methods here
        fail(new VaultUserError("The ZIP is damaged or uses unsupported compression", { cause: error }));
        return;
      }
      if (data) {
        // count actual inflated bytes before retaining or writing the chunk
        if (data.length > limits.maxEntryBytes - entrySize) {
          fail(new VaultUserError(`A file in the ZIP is larger than ${formatMegabytes(limits.maxEntryBytes)}`));
          return;
        }
        if (data.length > limits.maxDecompressedBytes - totalSize) {
          fail(new VaultUserError(`The ZIP expands to more than ${formatMegabytes(limits.maxDecompressedBytes)}`));
          return;
        }
        entrySize += data.length;
        totalSize += data.length;
        if (fd !== null) {
          if (data.length > limits.maxStagedBytes - stagedBytes) {
            fail(new VaultUserError("The ZIP expands too quickly to import safely"));
            return;
          }
          stagedBytes += data.length;
          try {
            let written = 0;
            while (written < data.length) {
              const count = writeSync(fd, data, written, data.length - written);
              if (!count) throw new Error("Could not write ZIP staging file");
              written += count;
            }
          } catch (writeError) {
            fail(writeError);
            return;
          }
        }
      }
      if (final) {
        unfinishedEntries--;
        if (fd !== null) {
          closeSync(fd);
          openFiles.delete(fd);
          fd = null;
          if (pending.length >= limits.maxPendingEntries) {
            fail(new VaultUserError("The ZIP expands too quickly to import safely"));
            return;
          }
          pending.push({ name: stream.name, path, size: entrySize });
        }
      }
    };
    stream.start();
  });
  // synchronous inflation keeps compressed input backpressure effective. Small
  // input slices bound each inflater allocation even when size headers lie
  unzip.register(UnzipInflate);

  const drain = async () => {
    while (pending.length > 0) {
      if (isCancelled()) throw new VaultImportCancelledError();
      const batch: typeof pending = [];
      let bytes = 0;
      while (batch.length < FILE_CONCURRENCY && pending.length > 0) {
        const entry = pending[0];
        if (batch.length > 0 && entry.size > limits.maxEntryBytes - bytes) break;
        batch.push(entry);
        pending.shift();
        bytes += entry.size;
      }
      // settle every active callback before cleanup or reporting a failure
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            const buffer = await readFile(entry.path);
            await processEntry(entry.name, buffer);
          } finally {
            await unlink(entry.path);
            stagedBytes -= entry.size;
          }
        }),
      );
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    }
  };

  try {
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new Error("Invalid ZIP stream bytes");
      for (let offset = 0; offset < chunk.length; offset += ZIP_INPUT_SLICE_BYTES) {
        if (isCancelled()) throw new VaultImportCancelledError();
        let bytes = chunk.subarray(offset, offset + ZIP_INPUT_SLICE_BYTES);
        if (!zipSignatureChecked) {
          const needed = 4 - header.length;
          const take = Math.min(needed, bytes.length);
          header = Buffer.concat([header, bytes.subarray(0, take)], header.length + take);
          bytes = bytes.subarray(take);
          if (header.length < 4) continue;
          const signature = header.toString("hex");
          if (signature !== "504b0304" && signature !== "504b0506") {
            throw new VaultUserError("Uploaded object is not a ZIP file");
          }
          zipSignatureChecked = true;
          unzip.push(header);
          header = Buffer.alloc(0);
        }
        if (bytes.length > 0) unzip.push(bytes);
        if (failure) throw failure;
        // no completed entry survives into the next compressed input slice
        await drain();
      }
    }
    if (!zipSignatureChecked) throw new VaultUserError("Uploaded object is not a ZIP file");
    unzip.push(new Uint8Array(0), true);
    if (failure) throw failure;
    if (unfinishedEntries > 0) throw new VaultUserError("ZIP contains unfinished entries");
    await drain();
    return entryCount;
  } finally {
    try {
      for (const fd of openFiles) closeSync(fd);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
