import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  getCanvasImportQueueUrl,
  getExtractRetryQueueUrl,
  sqsClient,
} from "@/lib/sqs";

const RETRY_DELAYS = [30, 120, 480, 900] as const;

export const MAX_EXTRACTION_RETRIES = RETRY_DELAYS.length;

export interface ExtractionRetryMessage {
  noteId: string;
  userId: string;
  s3Key: string | null;
  filename: string;
  mimeType: string;
  parentFolderId: string | null;
  attempt: number;
}

export function chooseExtractionRetryQueueUrl(
  retryQueueUrl: string,
  mainQueueUrl: string,
): string | null {
  const retryQueue = retryQueueUrl.trim();
  if (retryQueue) return retryQueue;

  // SQS_EXTRACT_RETRY_QUEUE_URL is not set — falling back to the main import queue.
  // Risk: retry messages (type: "extract-retry") share the queue with fresh import jobs.
  // Because SQS FIFO ordering is not guaranteed and retry messages carry a DelaySeconds,
  // they can be delivered out of order relative to new jobs and consume worker concurrency
  // slots for already-failed items, starving fresh imports. Set SQS_EXTRACT_RETRY_QUEUE_URL
  // to a separate queue in production to avoid this. The retry messages include a `type`
  // field ("extract-retry") and an `attempt` counter so they can be identified if needed.
  if (mainQueueUrl.trim()) {
    console.warn(
      "SQS_EXTRACT_RETRY_QUEUE_URL is not set — retry messages will be sent to the main " +
        "import queue. This can interfere with fresh import jobs. Set SQS_EXTRACT_RETRY_QUEUE_URL " +
        "to a dedicated retry queue in production.",
    );
  }

  const mainQueue = mainQueueUrl.trim();
  if (mainQueue) return mainQueue;

  return null;
}

export function getExtractionRetryDelaySeconds(attempt: number): number {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export async function enqueueExtractionRetry(
  msg: ExtractionRetryMessage,
): Promise<{
  delaySeconds: number;
  queueUrl: string;
  usedFallbackQueue: boolean;
}> {
  const retryQueueUrl = getExtractRetryQueueUrl();
  const mainQueueUrl = getCanvasImportQueueUrl();
  const queueUrl = chooseExtractionRetryQueueUrl(retryQueueUrl, mainQueueUrl);

  if (!queueUrl) {
    throw new Error(
      "No SQS queue configured for extraction retries (set SQS_EXTRACT_RETRY_QUEUE_URL or SQS_QUEUE_URL)",
    );
  }

  const delaySeconds = getExtractionRetryDelaySeconds(msg.attempt);
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      DelaySeconds: delaySeconds,
      MessageBody: JSON.stringify({
        type: "extract-retry",
        ...msg,
        attempt: msg.attempt + 1,
      }),
    }),
  );

  return {
    delaySeconds,
    queueUrl,
    usedFallbackQueue:
      !retryQueueUrl.trim() && queueUrl === mainQueueUrl.trim(),
  };
}
