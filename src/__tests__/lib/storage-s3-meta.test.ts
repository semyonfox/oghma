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
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

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

  it("deletes every object under a narrow prefix across list pages", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "marker/user/note/one.png" },
          { Key: "marker/user/note/two.png" },
        ],
        IsTruncated: true,
        NextContinuationToken: "next-page",
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Contents: [{ Key: "marker/user/note/three.png" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({});

    await storage.deletePrefix("marker/user/note/");

    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect((send.mock.calls[0][0] as ListObjectsV2Command).input).toMatchObject({
      Prefix: "marker/user/note/",
    });
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectsCommand);
    expect((send.mock.calls[1][0] as DeleteObjectsCommand).input).toMatchObject({
      Delete: {
        Objects: [
          { Key: "marker/user/note/one.png" },
          { Key: "marker/user/note/two.png" },
        ],
      },
    });
    expect((send.mock.calls[2][0] as ListObjectsV2Command).input).toMatchObject({
      ContinuationToken: "next-page",
    });
  });
});
