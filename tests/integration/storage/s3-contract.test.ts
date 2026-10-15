import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { ObjectNotFoundError } from "@/lib/storage/base";
import { getStorageProvider, resetStorageProvider } from "@/lib/storage/init";

describe("S3-compatible storage contract", () => {
  it("writes, reads, streams, and deletes an object", async () => {
    resetStorageProvider();
    const storage = getStorageProvider();
    const key = `integration/${randomUUID()}.txt`;

    await storage.putObject(key, "hello integration", {
      contentType: "text/plain",
    });

    await expect(storage.hasObject(key)).resolves.toBe(true);
    await expect(storage.getObject(key)).resolves.toBe("hello integration");
    await expect(storage.getObjectMeta(key)).resolves.toMatchObject({
      contentType: "text/plain",
      contentLength: 17,
    });

    const stream = await storage.getObjectStream(key);
    expect(stream.contentType).toBe("text/plain");
    stream.body.destroy();

    await storage.deleteObject(key);
    await expect(storage.hasObject(key)).resolves.toBe(false);
  });

  it("reports missing objects the same way the unit tests assume", async () => {
    resetStorageProvider();
    const storage = getStorageProvider();
    const key = `integration/${randomUUID()}/missing.pdf`;

    await expect(storage.hasObject(key)).resolves.toBe(false);
    await expect(storage.getObjectMeta(key)).resolves.toBeUndefined();
    await expect(storage.getObjectAndMeta(key)).resolves.toEqual({});
    await expect(storage.getObjectStream(key)).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });

  it("copies keys containing characters that need URL encoding", async () => {
    resetStorageProvider();
    const storage = getStorageProvider();
    const dir = `integration/${randomUUID()}`;
    const source = `${dir}/Week 1/a+b?#ä.md`;
    const target = `${dir}/copy.md`;
    const bytes = Buffer.from([0x23, 0x20, 0xff, 0x00]);

    await storage.putObject(source, bytes, { contentType: "text/markdown" });
    await storage.copyObject(source, target, {});

    const copied = await storage.getObjectAndMeta(target);
    expect(copied.buffer?.equals(bytes)).toBe(true);
    expect(copied.contentType).toBe("text/markdown");

    await storage.deletePrefix(dir);
    await expect(storage.hasObject(source)).resolves.toBe(false);
    await expect(storage.hasObject(target)).resolves.toBe(false);
  });
});
