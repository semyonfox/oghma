import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const storage = {
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  hasObject: vi.fn(),
  getObjectStream: vi.fn(),
};
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUserId: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: () => storage }));
vi.mock("@/lib/notes/storage/s3-storage", () => ({
  getSettingsFromS3: vi.fn(), saveSettingsToS3: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/api-error", async (original) => ({
  ...(await original<typeof import("@/lib/api-error")>()),
  assertTrustedOrigin: vi.fn(),
}));

import { getAuthenticatedUserId } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getSettingsFromS3, saveSettingsToS3 } from "@/lib/notes/storage/s3-storage";
import { GET, POST } from "@/app/api/auth/avatar/route";
import { GET as getAvatarImage } from "@/app/api/auth/avatar/image/route";
import { ObjectNotFoundError } from "@/lib/storage/base";
import { Readable } from "stream";

function avatarRequest(
  bytes: Uint8Array<ArrayBuffer> = new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  type = "image/png",
) {
  const form = new FormData();
  form.set("avatar", new File([bytes], "new.png", { type }));
  return new NextRequest("http://localhost/api/auth/avatar", { method: "POST", body: form });
}

describe("POST /api/auth/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("user-1");
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(getSettingsFromS3).mockResolvedValue({ avatarKey: "avatars/user-1/old.png" } as never);
    vi.mocked(saveSettingsToS3).mockResolvedValue(undefined as never);
    storage.putObject.mockResolvedValue(undefined);
    storage.deleteObject.mockResolvedValue(undefined);
    storage.hasObject.mockResolvedValue(true);
  });

  it("throttles before accepting avatar data", async () => {
    const limited = new Response("limited", { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(limited as never);
    const response = await POST(avatarRequest());
    expect(response.status).toBe(429);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("deletes the replaced avatar after saving the new settings", async () => {
    const response = await POST(avatarRequest());
    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith("avatar-upload", "user-1");
    expect(storage.deleteObject).toHaveBeenCalledWith("avatars/user-1/old.png");
  });

  it("rejects an oversized body before parsing or storing it", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/auth/avatar", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=synthetic" },
        body: new Uint8Array(5 * 1024 * 1024 + 70 * 1024),
      }),
    );
    expect(response.status).toBe(413);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  // the declared type is the client's word; only the bytes count
  it("stores the type detected from the bytes and refuses markup sent as an image", async () => {
    const avif = new Uint8Array([0, 0, 0, 0x1c, ...Buffer.from("ftypavif", "latin1")]);
    expect((await POST(avatarRequest(avif, "image/png"))).status).toBe(200);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^avatars\/user-1\/\d+\.avif$/),
      expect.any(Buffer),
      { contentType: "image/avif" },
    );

    storage.putObject.mockClear();
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    expect((await POST(avatarRequest(svg, "image/png"))).status).toBe(415);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("rejects a text field posing as the avatar", async () => {
    const form = new FormData();
    form.set("avatar", "not a file");
    const response = await POST(
      new NextRequest("http://localhost/api/auth/avatar", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("uses the canonical string user ID when reading the current avatar", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(getSettingsFromS3).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      avatarUrl: "/api/auth/avatar/image",
    });
  });
});

describe("GET /api/auth/avatar/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("user-1");
    vi.mocked(getSettingsFromS3).mockResolvedValue({ avatarKey: "avatars/user-1/a.png" } as never);
  });

  it("streams in one storage call and answers a missing object with 404", async () => {
    storage.getObjectStream.mockRejectedValue(new ObjectNotFoundError());
    expect((await getAvatarImage()).status).toBe(404);
    expect(storage.hasObject).not.toHaveBeenCalled();
  });

  it("reports a storage outage as a failure, not a missing avatar", async () => {
    storage.getObjectStream.mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect((await getAvatarImage()).status).toBe(500);
  });

  it("never renders a stored non-image type inline", async () => {
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from("<html></html>")]),
      contentType: "text/html",
    });
    const response = await getAvatarImage();
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toBe("attachment");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
  });

  it("serves a stored image inline", async () => {
    storage.getObjectStream.mockResolvedValue({
      body: Readable.from([Buffer.from([0x89, 0x50])]),
      contentType: "image/png",
    });
    const response = await getAvatarImage();
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
