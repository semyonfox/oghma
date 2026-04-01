import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  validateSession: vi.fn(),
}));

vi.mock("@/lib/notes/storage/s3-storage", () => ({
  getSettingsFromS3: vi.fn(),
  saveSettingsToS3: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { POST } from "@/app/api/settings/route";
import { validateSession } from "@/lib/auth";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";

const MOCK_USER = { user_id: "user-123" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateSession).mockResolvedValue(MOCK_USER as never);
  vi.mocked(getSettingsFromS3).mockResolvedValue({ locale: "en" });
});

describe("POST /api/settings", () => {
  it("persists profile and editor keys", async () => {
    const request = new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Lovelace",
        timezone: "Europe/Dublin",
        editorsize: "small",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveSettingsToS3).toHaveBeenCalledWith("user-123", {
      locale: "en",
      firstName: "Ada",
      lastName: "Lovelace",
      timezone: "Europe/Dublin",
      editorsize: "small",
    });
    expect(body).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      timezone: "Europe/Dublin",
      editorsize: "small",
    });
  });
});
