import { describe, expect, it, vi } from "vitest";
import { Zip, ZipPassThrough, zipSync, strToU8 } from "fflate";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { processVaultZipStream, type VaultZipSource } from "@/lib/vault/zip-stream";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
function source(bytes: Uint8Array): VaultZipSource {
  return {
    size: bytes.length,
    openRange: async (start, end) => Readable.from([bytes.subarray(start, end)]),
  };
}

describe("ZIP worker resource boundaries", () => {
  it("preserves normal markdown and binary entries", async () => {
    const files = {
      "study.md": strToU8("# Study"),
      "image.png": new Uint8Array([1, 2, 3]),
    };
    const results = new Map<string, Buffer>();
    const count = await processVaultZipStream(
      source(zipSync(files)),
      async (name, buffer) => {
        results.set(name, buffer);
      },
    );
    expect(count).toBe(2);
    expect(results.get("study.md")?.toString()).toBe("# Study");
    expect(results.get("image.png")).toEqual(Buffer.from([1, 2, 3]));
  });

  it("restores a Finder-style archive with descriptors and a word folder", async () => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, bytes) => {
      if (error) throw error;
      chunks.push(bytes);
    });
    for (const [path, text] of [
      ["word/", ""],
      ["word/Revision.md", "# Revision"],
      ["__MACOSX/word/._Revision.md", "Finder metadata"],
    ]) {
      const member = new ZipPassThrough(path);
      zip.add(member);
      member.push(strToU8(text), true);
    }
    zip.end();

    const restored = new Map<string, string>();
    const count = await processVaultZipStream(source(Buffer.concat(chunks)), async (name, bytes) => {
      restored.set(name, bytes.toString());
    });
    expect(count).toBe(1);
    expect(restored).toEqual(new Map([["word/Revision.md", "# Revision"]]));
  });

  it("follows ZIP64 file offsets past 4 GiB without reading the preceding bytes", async () => {
    const prefixBytes = 2 ** 32 + 1024;
    const original = Buffer.from(zipSync({ "a.md": strToU8("hello") }));
    const end = original.subarray(original.length - 22);
    const directoryOffset = end.readUInt32LE(16);
    const local = original.subarray(0, directoryOffset);
    const directory = original.subarray(directoryOffset, original.length - 22);
    directory.writeUInt16LE(12, 30);
    directory.writeUInt32LE(0xffffffff, 42);
    const extra = Buffer.alloc(12);
    extra.writeUInt16LE(1, 0);
    extra.writeUInt16LE(8, 2);
    extra.writeBigUInt64LE(BigInt(prefixBytes), 4);

    const zip64 = Buffer.alloc(56);
    zip64.writeUInt32LE(0x06064b50, 0);
    zip64.writeBigUInt64LE(BigInt(44), 4);
    zip64.writeBigUInt64LE(BigInt(1), 24);
    zip64.writeBigUInt64LE(BigInt(1), 32);
    zip64.writeBigUInt64LE(BigInt(directory.length + extra.length), 40);
    zip64.writeBigUInt64LE(BigInt(prefixBytes + directoryOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(prefixBytes + local.length + directory.length + extra.length), 8);
    locator.writeUInt32LE(1, 16);
    end.writeUInt32LE(0xffffffff, 16);
    const archive = Buffer.concat([local, directory, extra, zip64, locator, end]);

    const restored = vi.fn();
    await expect(processVaultZipStream({
      size: prefixBytes + archive.length,
      openRange: async (start, stop) => {
        const leadingBytes = Math.max(0, prefixBytes - start);
        expect(leadingBytes).toBeLessThan(66 * 1024);
        return Readable.from([
          Buffer.alloc(leadingBytes),
          archive.subarray(Math.max(0, start - prefixBytes), stop - prefixBytes),
        ]);
      },
    }, restored)).resolves.toBe(1);
    expect(restored).toHaveBeenCalledWith("a.md", Buffer.from("hello"));
  });

  it("applies source backpressure while completed entries are being consumed", async () => {
    const zip = zipSync(
      { "a.md": new Uint8Array(12000), "b.md": new Uint8Array(12000) },
      { level: 0 },
    );
    let pulled = 0;
    let started: () => void = () => {};
    let release: () => void = () => {};
    const consumerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const consumerReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    const directory = Buffer.from(zip).readUInt32LE(zip.length - 6);
    async function* chunks() {
      for (let offset = 0; offset < directory; offset += 4096) {
        pulled++;
        yield zip.subarray(offset, Math.min(directory, offset + 4096));
      }
    }
    const file = source(zip);
    const running = processVaultZipStream({
      size: file.size,
      openRange: async (start, end) => start === 0 && end === directory
        ? Readable.from(chunks(), { highWaterMark: 1 })
        : file.openRange(start, end),
    }, async () => {
      started();
      await consumerReleased;
    }, { maxPendingEntries: 1 });
    await consumerStarted;
    const atStart = pulled;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(pulled).toBe(atStart);
    expect(pulled).toBeLessThan(Math.ceil(directory / 4096));
    release();
    expect(await running).toBe(2);
  });
  it("counts inflated bytes even when the ZIP header lies", async () => {
    const zip = Buffer.from(zipSync({ "large.md": new Uint8Array(1000) }));
    const directory = zip.readUInt32LE(zip.length - 6);
    zip.writeUInt32LE(1, 22);
    zip.writeUInt32LE(1, directory + 24);
    const consume = vi.fn();
    await expect(
      processVaultZipStream(source(zip), consume, { maxEntryBytes: 100 }),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects corrupted bytes before handing them to the importer", async () => {
    const zip = Buffer.from(zipSync({ "a.md": strToU8("hello") }, { level: 0 }));
    zip[30 + "a.md".length] ^= 1;
    const consume = vi.fn();
    await expect(processVaultZipStream(source(zip), consume)).rejects.toThrow("ZIP is damaged");
    expect(consume).not.toHaveBeenCalled();
  });

  it("bounds entry count, total expansion and individual staging size", async () => {
    const zip = zipSync({
      "a.md": new Uint8Array(60),
      "b.md": new Uint8Array(60),
    });
    const consume = vi.fn();
    await expect(
      processVaultZipStream(source(zip), consume, { maxEntries: 1 }),
    ).rejects.toThrow();
    await expect(
      processVaultZipStream(source(zip), consume, { maxStagedBytes: 50 }),
    ).rejects.toThrow();
    await expect(
      processVaultZipStream(source(zip), consume, { maxDecompressedBytes: 100 }),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  });
  it("removes temporary staging on consumer failure and cancellation", async () => {
    const before = (await readdir(tmpdir())).filter((name) =>
      name.startsWith("oghma-vault-import-"),
    );
    const zip = zipSync({ "a.md": strToU8("hello") });
    await expect(
      processVaultZipStream(source(zip), async () => {
        throw new Error("synthetic failure");
      }),
    ).rejects.toThrow("synthetic failure");
    await expect(
      processVaultZipStream(source(zip), vi.fn(), {}, () => true),
    ).rejects.toThrow();
    expect(
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith("oghma-vault-import-"),
      ),
    ).toEqual(before);
  });
});
