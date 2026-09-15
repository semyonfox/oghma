import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueExtractRetryJob } = vi.hoisted(() => ({
  enqueueExtractRetryJob: vi.fn(),
}));

vi.mock("@/lib/queue", () => ({ enqueueExtractRetryJob }));

import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry";

const message = {
  noteId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  s3Key: "uploads/lecture.pdf",
  filename: "lecture.pdf",
  mimeType: "application/pdf",
  parentFolderId: null,
  attempt: 0,
};

describe("direct extraction retry publication", () => {
  beforeEach(() => {
    enqueueExtractRetryJob.mockReset();
    enqueueExtractRetryJob.mockResolvedValue(undefined);
  });

  it.each([
    [0, 30],
    [1, 120],
    [2, 480],
    [3, 900],
    [99, 900],
  ])("publishes attempt %i with a %i second delay", async (attempt, delay) => {
    await expect(
      enqueueExtractionRetry({ ...message, attempt }),
    ).resolves.toEqual({ delaySeconds: delay });
    expect(enqueueExtractRetryJob).toHaveBeenCalledWith(
      { ...message, attempt: attempt + 1 },
      delay,
    );
  });

  it("propagates queue publication failures", async () => {
    enqueueExtractRetryJob.mockRejectedValue(new Error("queue unavailable"));

    await expect(enqueueExtractionRetry(message)).rejects.toThrow(
      "queue unavailable",
    );
  });
});
