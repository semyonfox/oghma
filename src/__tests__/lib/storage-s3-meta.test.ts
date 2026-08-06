import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});

import { StoreS3 } from "@/lib/storage/s3";

describe("StoreS3.getObjectMeta", () => {
  const storage = new StoreS3({
    bucket: "test",
    accessKey: "access",
    secretKey: "secret",
  });

  beforeEach(() => {
    send.mockReset();
  });

  it("treats a successful HEAD without custom metadata as an existing object", async () => {
    send.mockResolvedValueOnce({});

    await expect(storage.getObjectMeta("result.json")).resolves.toEqual({});
  });

  it("returns undefined only for a confirmed missing object", async () => {
    const missing = new Error("NoSuchKey");
    missing.name = "NoSuchKey";
    send.mockRejectedValueOnce(missing);

    await expect(
      storage.getObjectMeta("missing.json"),
    ).resolves.toBeUndefined();
  });

  it("treats R2 NotFound/UnknownError metadata responses as a missing object", async () => {
    const missing = new Error("UnknownError");
    missing.name = "NotFound";
    send.mockRejectedValueOnce(missing);

    await expect(
      storage.getObjectMeta("missing.json"),
    ).resolves.toBeUndefined();
  });

  it("propagates storage failures instead of treating them as absence", async () => {
    send.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(storage.getObjectMeta("result.json")).rejects.toThrow(
      "storage unavailable",
    );
  });
});
