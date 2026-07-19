import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const storage = { putObject: vi.fn(), deleteObject: vi.fn() };
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ validateSession: vi.fn() }));
vi.mock("@/lib/rateLimiter", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/storage/init", () => ({ getStorageProvider: () => storage }));
vi.mock("@/lib/notes/storage/s3-storage", () => ({
  getSettingsFromS3: vi.fn(), saveSettingsToS3: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/api-error", () => ({ assertTrustedOrigin: vi.fn() }));

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimiter";
import { getSettingsFromS3, saveSettingsToS3 } from "@/lib/notes/storage/s3-storage";
import { POST } from "@/app/api/auth/avatar/route";

function avatarRequest() {
  const form = new FormData();
  form.set("avatar", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "new.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/auth/avatar", { method: "POST", body: form });
}

describe("POST /api/auth/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(getSettingsFromS3).mockResolvedValue({ avatarKey: "avatars/user-1/old.png" } as never);
    vi.mocked(saveSettingsToS3).mockResolvedValue(undefined as never);
    storage.putObject.mockResolvedValue(undefined);
    storage.deleteObject.mockResolvedValue(undefined);
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
});
