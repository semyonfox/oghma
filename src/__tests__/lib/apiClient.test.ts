import { beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage, login, register } from "@/lib/apiClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("browser auth API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn<typeof fetch>();
  });

  it("posts login credentials with the browser session", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ success: true }),
    );

    await expect(login("student@example.com", "password", true)).resolves.toEqual(
      { success: true },
    );
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com",
        password: "password",
        rememberMe: true,
      }),
    });
  });

  it("forwards registration attribution and agent claims", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ requiresVerification: true }),
    );
    const marketing = { source: "homepage" };

    await register("student@example.com", "StrongPass1", marketing, {
      agentClaimToken: "claim-token",
      agentUserCode: "123456",
    });

    const request = vi.mocked(global.fetch).mock.calls[0];
    expect(request?.[0]).toBe("/api/auth/register");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      email: "student@example.com",
      password: "StrongPass1",
      marketing,
      agentClaimToken: "claim-token",
      agentUserCode: "123456",
    });
  });

  it("returns the API's field errors to the form", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse(
        {
          error: "Validation failed",
          validationErrors: {
            email: "Email is invalid",
            password: ["Password is too short", "Password needs a number"],
            ignored: 42,
          },
        },
        422,
      ),
    );

    try {
      await login("invalid", "short");
      throw new Error("expected login to reject");
    } catch (error) {
      expect(error).toMatchObject({
        name: "APIError",
        message: "Validation failed",
        status: 422,
      });
      expect(getErrorMessage(error)).toBe(
        "Email is invalid; Password is too short; Password needs a number",
      );
    }
  });

  it.each(["Failed to fetch", "Load failed"])(
    "maps a failed fetch to the connection error regardless of browser wording",
    async (message) => {
      vi.mocked(global.fetch).mockRejectedValue(new TypeError(message));

      try {
        await login("student@example.com", "password");
        throw new Error("expected login to reject");
      } catch (error) {
        expect(getErrorMessage(error)).toBe(
          "No server response. Please check your connection.",
        );
      }
    },
  );
});
