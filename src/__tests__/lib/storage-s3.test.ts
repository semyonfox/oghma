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

import { createS3ClientConfig, StoreS3 } from "@/lib/storage/s3";
import { ObjectNotFoundError } from "@/lib/storage/base";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

function storageError(name: string, httpStatusCode?: number) {
  return Object.assign(new Error(name), {
    name,
    ...(httpStatusCode ? { $metadata: { httpStatusCode } } : {}),
  });
}

describe("StoreS3", () => {
  const storage = new StoreS3({
    bucket: "test",
    accessKey: "access",
    secretKey: "secret",
  });

  beforeEach(() => {
    send.mockReset();
    vi.restoreAllMocks();
  });

  it("passes cancellation to object deletion so a vault quota lock has a bounded storage wait", async () => {
    const controller = new AbortController();
    send.mockImplementation(async (_command: unknown, options: { abortSignal?: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        options.abortSignal?.addEventListener(
          "abort",
          () => reject(new Error("synthetic abort")),
          { once: true },
        );
        if (options.abortSignal?.aborted) reject(new Error('synthetic abort'));
        if (!options.abortSignal) resolve();
      });
    });
    const deletion = storage.deleteObject('synthetic-expired.zip', controller.signal);
    controller.abort();
    await expect(deletion).rejects.toThrow('synthetic abort');
    expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand), { abortSignal: controller.signal });
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
      .mockResolvedValueOnce({ Errors: [] })
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

  it("rejects a partial bulk delete without exposing failed object keys", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "marker/user/note/one.png" },
          { Key: "marker/user/note/private-name.png" },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Errors: [{ Key: "marker/user/note/private-name.png", Code: "AccessDenied" }],
      });

    await expect(storage.deletePrefix("marker/user/note/")).rejects.toThrow(
      /^Failed to delete 1 storage object$/,
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reports a confirmed 404 as absence but an outage as a failure", async () => {
    send.mockRejectedValueOnce(storageError("NotFound", 404));
    await expect(storage.hasObject("gone.pdf")).resolves.toBe(false);

    // previously any error meant "missing", so an S3 outage looked like data loss
    send.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(storage.hasObject("live.pdf")).rejects.toThrow("ECONNREFUSED");

    // a wrong bucket is misconfiguration, not a missing object
    send.mockRejectedValueOnce(storageError("NoSuchBucket", 404));
    await expect(storage.hasObject("live.pdf")).rejects.toThrow("NoSuchBucket");
  });

  it("maps a missing stream to the provider-neutral ObjectNotFoundError", async () => {
    send.mockRejectedValueOnce(storageError("NoSuchKey", 404));
    await expect(storage.getObjectStream("gone.pdf")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );

    send.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(storage.getObjectStream("live.pdf")).rejects.toThrow("socket hang up");
  });

  it("returns object bytes without decoding binary content to a string", async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array(pdf) },
      ContentType: "application/pdf",
      ContentLength: pdf.length,
    });

    const result = await storage.getObjectAndMeta("lecture.pdf");

    expect(result).toEqual({
      buffer: pdf,
      contentType: "application/pdf",
      contentLength: 6,
      meta: undefined,
    });
  });

  it("returns an empty object for a missing object and propagates outages", async () => {
    send.mockRejectedValueOnce(storageError("NoSuchKey", 404));
    await expect(storage.getObjectAndMeta("gone.pdf")).resolves.toEqual({});

    send.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(storage.getObject("settings.json")).rejects.toThrow("storage unavailable");
  });

  it("URL-encodes copy sources so vault and Canvas filenames copy the right key", async () => {
    send.mockResolvedValueOnce({});
    const prefixed = new StoreS3({ bucket: "bucket", prefix: "oghma" });

    await prefixed.copyObject("vault/u/j/Week 1/a+b?#ä.md", "notes/n/a+b.md", {});

    const input = (send.mock.calls[0][0] as CopyObjectCommand).input;
    expect(input.CopySource).toBe(
      "bucket/oghma/vault/u/j/Week%201/a%2Bb%3F%23%C3%A4.md",
    );
    expect(input.Key).toBe("oghma/notes/n/a+b.md");
    expect(input.MetadataDirective).toBe("COPY");
  });

  it("does not write object keys or errors to the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    send.mockRejectedValue(new Error("private/student@example.test/key.pdf"));

    await expect(storage.putObject("private/key.pdf", "x")).rejects.toThrow();
    await expect(storage.deleteObject("private/key.pdf")).rejects.toThrow();

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createS3ClientConfig", () => {
  it("bounds connection and request time so a wedged backend cannot hang callers", () => {
    expect(createS3ClientConfig({ bucket: "b" }).requestHandler).toEqual({
      connectionTimeout: 5_000,
      requestTimeout: 60_000,
      throwOnRequestTimeout: true,
    });
  });
});
