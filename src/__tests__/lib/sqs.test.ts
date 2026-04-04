import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCanvasImportQueueUrl, getExtractRetryQueueUrl } from "@/lib/sqs";

describe("sqs queue url getters", () => {
  let originalQueueUrl: string | undefined;
  let originalRetryUrl: string | undefined;

  beforeEach(() => {
    originalQueueUrl = process.env.SQS_QUEUE_URL;
    originalRetryUrl = process.env.SQS_EXTRACT_RETRY_QUEUE_URL;
  });

  afterEach(() => {
    if (originalQueueUrl === undefined) {
      delete process.env.SQS_QUEUE_URL;
    } else {
      process.env.SQS_QUEUE_URL = originalQueueUrl;
    }

    if (originalRetryUrl === undefined) {
      delete process.env.SQS_EXTRACT_RETRY_QUEUE_URL;
    } else {
      process.env.SQS_EXTRACT_RETRY_QUEUE_URL = originalRetryUrl;
    }
  });

  it("returns canvas queue url from env", () => {
    process.env.SQS_QUEUE_URL = "https://sqs.example.com/canvas";
    expect(getCanvasImportQueueUrl()).toBe("https://sqs.example.com/canvas");
  });

  it("returns retry queue url from env", () => {
    process.env.SQS_EXTRACT_RETRY_QUEUE_URL = "https://sqs.example.com/retry";
    expect(getExtractRetryQueueUrl()).toBe("https://sqs.example.com/retry");
  });

  it("falls back to empty string when vars are missing", () => {
    delete process.env.SQS_QUEUE_URL;
    delete process.env.SQS_EXTRACT_RETRY_QUEUE_URL;

    expect(getCanvasImportQueueUrl()).toBe("");
    expect(getExtractRetryQueueUrl()).toBe("");
  });

  it("reads process.env at call time, not module load time", () => {
    process.env.SQS_QUEUE_URL = "https://sqs.example.com/first";
    expect(getCanvasImportQueueUrl()).toBe("https://sqs.example.com/first");

    process.env.SQS_QUEUE_URL = "https://sqs.example.com/second";
    expect(getCanvasImportQueueUrl()).toBe("https://sqs.example.com/second");
  });
});
