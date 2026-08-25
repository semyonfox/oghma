import { describe, expect, it } from "vitest";
import { readResponseError } from "@/components/settings/settings-utils";

describe("readResponseError", () => {
  it("uses the API's user-facing error when it is available", async () => {
    await expect(
      readResponseError(
        new Response(JSON.stringify({ error: "Upload is too large" })),
        "Upload failed",
      ),
    ).resolves.toBe("Upload is too large");
  });

  it("keeps the caller's fallback for empty or malformed error responses", async () => {
    await expect(
      readResponseError(new Response("gateway unavailable"), "Upload failed"),
    ).resolves.toBe("Upload failed");
  });
});
