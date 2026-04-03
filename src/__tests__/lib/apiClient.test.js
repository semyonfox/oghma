import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  apiGet,
  apiPost,
  getErrorMessage,
  getValidationErrors,
  isErrorStatus,
} from "@/lib/apiClient.js";

function makeJsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("apiGet sends JSON headers and includes credentials by default", async () => {
    global.fetch.mockResolvedValue(makeJsonResponse({ ok: true }));

    await apiGet("/api/ping");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/ping",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("apiPost serializes JSON body", async () => {
    global.fetch.mockResolvedValue(makeJsonResponse({ created: true }));

    await apiPost("/api/items", { name: "test" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      }),
    );
  });

  it("throws APIError with status and payload for non-2xx responses", async () => {
    global.fetch.mockResolvedValue(
      makeJsonResponse({ error: "Invalid input" }, false, 400),
    );

    await expect(apiGet("/api/fail")).rejects.toMatchObject({
      name: "APIError",
      message: "Invalid input",
      status: 400,
      data: { error: "Invalid input" },
    });
  });

  it("maps failed fetch network errors to friendly APIError", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiGet("/api/offline")).rejects.toMatchObject({
      message: "No server response. Please check your connection.",
      status: 0,
    });
  });

  it("maps abort errors to timeout APIError", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    global.fetch.mockRejectedValue(abortErr);

    await expect(apiGet("/api/slow")).rejects.toMatchObject({
      message: "Request timeout",
      status: 408,
    });
  });

  it("extracts validation messages and status helpers correctly", () => {
    const err = new APIError("Validation failed", 422, {
      validationErrors: {
        email: "Email is invalid",
        password: "Password is too short",
      },
    });

    expect(getErrorMessage(err)).toBe(
      "Email is invalid; Password is too short",
    );
    expect(getValidationErrors(err)).toEqual({
      email: "Email is invalid",
      password: "Password is too short",
    });
    expect(isErrorStatus(err, 422)).toBe(true);
    expect(isErrorStatus(err, 400)).toBe(false);
  });

  it("returns fallback values for non-API errors", () => {
    const plainError = new Error("plain failure");
    expect(getErrorMessage(plainError)).toBe("plain failure");
    expect(getValidationErrors(plainError)).toBeNull();
    expect(isErrorStatus(plainError, 500)).toBe(false);
  });
});
