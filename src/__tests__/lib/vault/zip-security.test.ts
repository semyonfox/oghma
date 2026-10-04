import { describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { processVaultZipStream } from "@/lib/vault/import-worker";

vi.mock("@/database/pgsql", () => ({ default: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({
  recordActivationMilestone: vi.fn(),
}));
async function* source(bytes: Uint8Array) {
  yield bytes;
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
    async function* chunks() {
      for (let offset = 0; offset < zip.length; offset += 4096) {
        pulled++;
        yield zip.subarray(offset, offset + 4096);
      }
    }
    const running = processVaultZipStream(chunks(), async () => {
      started();
      await consumerReleased;
    });
    await consumerStarted;
    const atStart = pulled;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(pulled).toBe(atStart);
    expect(pulled).toBeLessThan(Math.ceil(zip.length / 4096));
    release();
    expect(await running).toBe(2);
  });
  it("counts inflated bytes even when the ZIP header lies", async () => {
    const zip = zipSync({ "large.md": new Uint8Array(1000) });
    new DataView(zip.buffer, zip.byteOffset).setUint32(22, 1, true);
    const consume = vi.fn();
    await expect(
      processVaultZipStream(source(zip), consume, { maxEntryBytes: 100 }),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  });
  it("bounds queued entries and staged bytes before consumer allocations", async () => {
    const zip = zipSync({
      "a.md": new Uint8Array(60),
      "b.md": new Uint8Array(60),
    });
    const consume = vi.fn();
    await expect(
      processVaultZipStream(source(zip), consume, { maxStagedBytes: 100 }),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
    await expect(
      processVaultZipStream(source(zip), consume, { maxPendingEntries: 1 }),
    ).rejects.toThrow();
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
