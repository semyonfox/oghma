/**
 * Pure queue-message decoding for the worker. Runtime startup, queue polling,
 * logging, and provider clients stay in worker-entry.ts; this module only
 * validates a message and selects the matching handler.
 */

export type CanvasJobData = Record<string, unknown>;

export interface DirectExtractionJobData extends CanvasJobData {
  noteId: string;
  userId: string;
  s3Key: string;
  mimeType: string;
  filename?: string;
}

export interface ExtractionRetryJobData extends CanvasJobData {
  noteId: string;
  userId: string;
  s3Key: string | null;
  filename: string;
  mimeType: string;
  parentFolderId: string | null;
  attempt: number;
  importRecordId?: string | null;
  jobId?: string | null;
}

export interface CanvasJob {
  data?: CanvasJobData;
  name?: string;
  id?: string;
  attemptsMade?: number;
}

export interface CanvasJobHandlers {
  processDiscoverJob: (jobId: string, attempt: number) => Promise<unknown>;
  processCanvasFile: (data: {
    importRecordId: string;
    jobId: string;
    userId: string;
    attempt: number;
  }) => Promise<unknown>;
  processImportJob: (jobId: string) => Promise<unknown>;
  processDirectExtraction: (data: DirectExtractionJobData) => Promise<unknown>;
  processExtractionRetry: (data: ExtractionRetryJobData) => Promise<unknown>;
  processMarkerComplete: (data: CanvasJobData) => Promise<unknown>;
  processMarkerFailed: (data: CanvasJobData) => Promise<unknown>;
  dispatchMarkerJob: (callbackId: string) => Promise<unknown>;
  processVaultExport: (data: CanvasJobData) => Promise<unknown>;
  processVaultImport: (data: CanvasJobData) => Promise<unknown>;
}

function requireJobData(job: CanvasJob): CanvasJobData {
  if (!job.data) {
    throw new Error("Job data is missing");
  }
  return job.data;
}

export function requireJobString(data: CanvasJobData, field: string): string {
  const value = data[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Job data field ${field} is missing or invalid`);
  }
  return value;
}

function optionalJobString(
  data: CanvasJobData,
  field: string,
): string | null | undefined {
  const value = data[field];
  if (value === null || value === undefined || typeof value === "string") {
    return value;
  }
  throw new Error(`Job data field ${field} is invalid`);
}

function requireJobAttempt(data: CanvasJobData): number {
  const value = data.attempt;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Job data field attempt is missing or invalid");
  }
  return value;
}

function canvasFileData(data: CanvasJobData): {
  importRecordId: string;
  jobId: string;
  userId: string;
} {
  return {
    importRecordId: requireJobString(data, "importRecordId"),
    jobId: requireJobString(data, "jobId"),
    userId: requireJobString(data, "userId"),
  };
}

function directExtractionData(data: CanvasJobData): DirectExtractionJobData {
  const filename = optionalJobString(data, "filename");
  return {
    ...data,
    noteId: requireJobString(data, "noteId"),
    userId: requireJobString(data, "userId"),
    s3Key: requireJobString(data, "s3Key"),
    mimeType: requireJobString(data, "mimeType"),
    ...(filename ? { filename } : {}),
  };
}

function extractionRetryData(data: CanvasJobData): ExtractionRetryJobData {
  return {
    ...data,
    noteId: requireJobString(data, "noteId"),
    userId: requireJobString(data, "userId"),
    s3Key: optionalJobString(data, "s3Key") ?? null,
    filename: requireJobString(data, "filename"),
    mimeType: requireJobString(data, "mimeType"),
    parentFolderId: optionalJobString(data, "parentFolderId") ?? null,
    attempt: requireJobAttempt(data),
    importRecordId: optionalJobString(data, "importRecordId"),
    jobId: optionalJobString(data, "jobId"),
  };
}

export function canvasJobType(job: CanvasJob): string | undefined {
  return typeof job.data?.type === "string" ? job.data.type : job.name;
}

export function jobAttempt(job: CanvasJob): number {
  return typeof job.attemptsMade === "number" &&
    Number.isInteger(job.attemptsMade) &&
    job.attemptsMade >= 0
    ? job.attemptsMade
    : 0;
}

/**
 * Dispatch a validated worker message. Returns false for unknown message types
 * so the runtime can preserve its existing warning and acknowledgement policy.
 */
export async function dispatchCanvasJob(
  job: CanvasJob,
  handlers: CanvasJobHandlers,
): Promise<boolean> {
  const type = canvasJobType(job);
  const data = () => requireJobData(job);

  switch (type) {
    case "canvas-discover":
      await handlers.processDiscoverJob(
        requireJobString(data(), "jobId"),
        jobAttempt(job),
      );
      return true;
    case "canvas-file": {
      const payload = data();
      await handlers.processCanvasFile({
        ...canvasFileData(payload),
        attempt: jobAttempt(job),
      });
      return true;
    }
    // Keep accepting already-enqueued messages from before the split import
    // pipeline; producers no longer create this legacy shape.
    case "canvas-import":
      await handlers.processImportJob(requireJobString(data(), "jobId"));
      return true;
    case "extract":
      await handlers.processDirectExtraction(directExtractionData(data()));
      return true;
    case "extract-retry":
      await handlers.processExtractionRetry(extractionRetryData(data()));
      return true;
    case "marker-complete": {
      const payload = data();
      await handlers.processMarkerComplete({
        ...payload,
        markerJobId: requireJobString(payload, "markerJobId"),
      });
      return true;
    }
    case "marker-failed": {
      const payload = data();
      await handlers.processMarkerFailed({
        ...payload,
        markerJobId: requireJobString(payload, "markerJobId"),
      });
      return true;
    }
    case "marker-dispatch":
      await handlers.dispatchMarkerJob(requireJobString(data(), "callbackId"));
      return true;
    case "vault-export":
      await handlers.processVaultExport(data());
      return true;
    case "vault-import":
      await handlers.processVaultImport(data());
      return true;
    default:
      return false;
  }
}
