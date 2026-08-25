import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Locale } from "@/locales";

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

import { GET, POST } from "@/app/api/settings/route";
import { validateSession } from "@/lib/auth";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";

const MOCK_USER = { user_id: "user-123" };
const ORIGINAL_LLM_MODEL = process.env.LLM_MODEL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LLM_MODEL = "deepseek/deepseek-v4-flash";
  vi.mocked(validateSession).mockResolvedValue(MOCK_USER as never);
  vi.mocked(getSettingsFromS3).mockResolvedValue({ locale: Locale.EN });
});

afterEach(() => {
  if (ORIGINAL_LLM_MODEL === undefined) {
    delete process.env.LLM_MODEL;
  } else {
    process.env.LLM_MODEL = ORIGINAL_LLM_MODEL;
  }
});

describe("GET /api/settings", () => {
  it("includes the server-managed AI model without requiring it in stored settings", async () => {
    const request = new NextRequest("http://localhost/api/settings");

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      locale: Locale.EN,
      ai_model: "deepseek/deepseek-v4-flash",
    });
  });

  it("omits the locale for an account that never chose a language", async () => {
    vi.mocked(getSettingsFromS3).mockResolvedValueOnce({ theme: "dark" });

    const response = await GET(new NextRequest("http://localhost/api/settings"));
    const body = await response.json();

    // Defaulting this to English would look like a deliberate choice and would
    // overwrite a language the visitor picked before signing in.
    expect(Object.hasOwn(body, "locale")).toBe(false);
    expect(response.cookies.get("ogma-locale")).toBeUndefined();
  });

  it("mirrors a stored locale into the request cookie", async () => {
    vi.mocked(getSettingsFromS3).mockResolvedValueOnce({ locale: Locale.GA });

    const response = await GET(new NextRequest("http://localhost/api/settings"));

    expect(response.cookies.get("ogma-locale")?.value).toBe(Locale.GA);
  });
});

describe("POST /api/settings", () => {
  it("persists profile and editor keys", async () => {
    const request = new NextRequest("http://localhost/api/settings", {
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
      ai_model: "deepseek/deepseek-v4-flash",
    });
  });

  it("persists the Canvas AI access flag", async () => {
    const request = new NextRequest("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai_canvas_access: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveSettingsToS3).toHaveBeenCalledWith("user-123", {
      locale: "en",
      ai_canvas_access: true,
    });
    expect(body).toMatchObject({
      ai_canvas_access: true,
      ai_model: "deepseek/deepseek-v4-flash",
    });
  });

  it("normalizes supported locale input and leaves an invalid stored locale unchanged", async () => {
    vi.mocked(getSettingsFromS3).mockResolvedValueOnce({ locale: Locale.GA });

    const normalizedResponse = await POST(
      new NextRequest("http://localhost/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "fr" }),
      }),
    );

    expect(normalizedResponse.status).toBe(200);
    expect(saveSettingsToS3).toHaveBeenLastCalledWith("user-123", {
      locale: Locale.FR_FR,
    });

    vi.mocked(getSettingsFromS3).mockResolvedValueOnce({ locale: Locale.GA });
    const invalidResponse = await POST(
      new NextRequest("http://localhost/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "not-a-locale" }),
      }),
    );

    expect(invalidResponse.status).toBe(200);
    expect(saveSettingsToS3).toHaveBeenLastCalledWith("user-123", {
      locale: Locale.GA,
    });
  });

  it("does not persist client-submitted AI model changes", async () => {
    vi.mocked(getSettingsFromS3).mockResolvedValueOnce({
      locale: Locale.EN,
      ai_model: "stored-model",
    });

    const request = new NextRequest("http://localhost/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai_model: "kimi-k2.5",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveSettingsToS3).toHaveBeenCalledWith("user-123", {
      locale: "en",
    });
    expect(body.ai_model).toBe("deepseek/deepseek-v4-flash");
  });
});
