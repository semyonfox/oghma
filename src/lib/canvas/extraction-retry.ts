import { enqueueExtractRetryJob } from "@/lib/queue";

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

export function getExtractionRetryDelaySeconds(attempt: number): number {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export async function enqueueExtractionRetry(
  msg: ExtractionRetryMessage,
): Promise<{ delaySeconds: number }> {
  const delaySeconds = getExtractionRetryDelaySeconds(msg.attempt);
  await enqueueExtractRetryJob(
    { ...msg, attempt: msg.attempt + 1 },
    delaySeconds,
  );
  return { delaySeconds };
}
