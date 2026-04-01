import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureMarkerRunningMock = vi.fn();

vi.mock("@/lib/marker-ec2", () => ({
  ensureMarkerRunning: ensureMarkerRunningMock,
}));

describe("extractWithMarker", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    ensureMarkerRunningMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses Marker when ASG mode is configured", async () => {
    process.env.MARKER_ASG_NAME = "<marker-asg>";
    process.env.MARKER_ASG_REGION = "eu-west-1";
    process.env.MARKER_API_URL = "http://marker.local";
    process.env.MARKER_EC2_INSTANCE_ID = "";

    ensureMarkerRunningMock.mockResolvedValue("http://marker.local");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          output: "# hello\n\n---\n\n# world",
        }),
      }),
    );

    const { extractWithMarker } = await import("@/lib/ocr");
    const result = await extractWithMarker(Buffer.from("pdf"), "notes.pdf");

    expect(ensureMarkerRunningMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ec2");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("throws when Marker is not configured", async () => {
    delete process.env.MARKER_ASG_NAME;
    delete process.env.MARKER_EC2_INSTANCE_ID;
    process.env.MARKER_API_URL = "http://marker.local";

    const { extractWithMarker } = await import("@/lib/ocr");

    await expect(
      extractWithMarker(Buffer.from("pdf"), "notes.pdf"),
    ).rejects.toThrow("Marker is not configured");
  });
});
