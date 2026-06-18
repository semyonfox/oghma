import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
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

    const stream = await storage.getObjectStream(key);
    expect(stream.contentType).toBe("text/plain");

    await storage.deleteObject(key);
    await expect(storage.hasObject(key)).resolves.toBe(false);
  });
});

