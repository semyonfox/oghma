import logger from "@/lib/logger";
import {
  CANVAS_IMPORT_QUEUE,
  CHAT_GENERATION_QUEUE,
  EXTRACT_RETRY_QUEUE,
  MARKER_DISPATCH_QUEUE,
  ackCloudflareQueueMessages,
  cloudflareAttemptsMade,
  getQueueConnection,
  getQueueProvider,
  parseCloudflareQueueBody,
  pullCloudflareQueueMessages,
  type CloudflarePulledMessage,
} from "@/lib/queue";
import { requireJobString, type CanvasJob } from "@/lib/canvas/job-dispatch";

export interface ConsumerOptions {
  processJob: (job: CanvasJob) => Promise<void>;
  processChatGeneration: (
    generationId: string,
    attemptsStarted: number,
    maxAttempts: number,
  ) => Promise<void>;
  jobConcurrency: number;
  chatConcurrency: number;
  markerDispatch: { enabled: boolean; concurrency: number };
}

export interface QueueConsumers {
  isRunning(): boolean;
  /** Stop taking new work and wait for in-flight jobs to settle. */
  close(): Promise<void>;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// BullMQ renews this lock while a job runs. Durable progress lives in
// PostgreSQL claims, so a lock lost to a dead process only causes a redelivery
// that the database rejects or resumes
const BULLMQ_LOCK = { lockDuration: 60_000, stalledInterval: 30_000 };

// BullMQ 6 refetches straight away when Redis rejects the fetch script (MISCONF
// on a full disk, OOM), so one fault emits hundreds of errors a second per
// queue. report the first each minute rather than flooding logs and Sentry
const QUEUE_ERROR_REPORT_INTERVAL_MS = 60_000;

async function startBullMqConsumers(options: ConsumerOptions): Promise<QueueConsumers> {
  const { Worker } = await import("bullmq");
  const connection = getQueueConnection();
  const workers = [
    new Worker(CANVAS_IMPORT_QUEUE, options.processJob, {
      connection,
      concurrency: options.jobConcurrency,
      ...BULLMQ_LOCK,
    }),
    // drains extract-retry messages published before retries moved onto the
    // Canvas queue
    new Worker(EXTRACT_RETRY_QUEUE, options.processJob, {
      connection,
      concurrency: options.jobConcurrency,
      ...BULLMQ_LOCK,
    }),
    new Worker(
      CHAT_GENERATION_QUEUE,
      async (job) => {
        const generationId = requireJobString(job.data ?? {}, "generationId");
        await options.processChatGeneration(
          generationId,
          job.attemptsStarted,
          job.opts.attempts ?? 1,
        );
      },
      { connection, concurrency: options.chatConcurrency, ...BULLMQ_LOCK },
    ),
  ];
  if (options.markerDispatch.enabled) {
    workers.push(
      new Worker(MARKER_DISPATCH_QUEUE, options.processJob, {
        connection,
        concurrency: options.markerDispatch.concurrency,
        ...BULLMQ_LOCK,
      }),
    );
  }

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      logger.error("worker job failed", { queue: worker.name, jobName: job?.name, error });
    });
    let lastReportedAt = -Infinity;
    worker.on("error", (error) => {
      const now = Date.now();
      if (now - lastReportedAt < QUEUE_ERROR_REPORT_INTERVAL_MS) return;
      lastReportedAt = now;
      logger.error("worker queue error", { queue: worker.name, error });
    });
  }

  return {
    isRunning: () => workers.every((worker) => worker.isRunning()),
    close: async () => {
      await Promise.allSettled(workers.map((worker) => worker.close()));
    },
  };
}

function cloudflareJobFromMessage(message: CloudflarePulledMessage): CanvasJob {
  const data = parseCloudflareQueueBody(message);
  return {
    id: message.id,
    name: typeof data.type === "string" ? data.type : "unknown",
    data,
    attemptsMade: cloudflareAttemptsMade(message.attempts),
  };
}

/** Pull, process and acknowledge one batch. Returns false when the queue was empty. */
export async function processCloudflareQueueBatch(
  queueName: string,
  concurrency: number,
  processJob: (job: CanvasJob) => Promise<void>,
): Promise<boolean> {
  const batch = await pullCloudflareQueueMessages(queueName, {
    batchSize: concurrency,
    visibilityTimeoutMs: positiveIntegerEnv(
      "CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_MS",
      12 * 60 * 60 * 1000,
    ),
  });
  if (batch.messages.length === 0) return false;

  const retryDelaySeconds = positiveIntegerEnv("CLOUDFLARE_QUEUE_RETRY_DELAY_SECONDS", 60);
  const acks: string[] = [];
  const retries: { lease_id: string; delay_seconds: number }[] = [];
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await processJob(cloudflareJobFromMessage(message));
        acks.push(message.lease_id);
      } catch (error) {
        logger.error("worker job failed", { queue: queueName, error });
        retries.push({ lease_id: message.lease_id, delay_seconds: retryDelaySeconds });
      }
    }),
  );

  await ackCloudflareQueueMessages(queueName, acks, retries);
  return true;
}

function startCloudflarePullLoop(
  queueName: string,
  concurrency: number,
  processJob: (job: CanvasJob) => Promise<void>,
): { done: Promise<void>; stop(): void } {
  let stopped = false;
  let wake: (() => void) | null = null;
  const idle = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const done = (async () => {
    while (!stopped) {
      let hadMessages = false;
      try {
        hadMessages = await processCloudflareQueueBatch(queueName, concurrency, processJob);
      } catch (error) {
        logger.error("worker queue error", { queue: queueName, error });
      }
      if (!hadMessages && !stopped) {
        await idle(positiveIntegerEnv("CLOUDFLARE_QUEUE_EMPTY_POLL_INTERVAL_MS", 5_000));
      }
    }
  })();

  return {
    done,
    // the batch in flight finishes and is acknowledged; without that its
    // messages stay invisible for the whole visibility timeout
    stop() {
      stopped = true;
      wake?.();
    },
  };
}

function startCloudflareConsumers(options: ConsumerOptions): QueueConsumers {
  const loops = [
    startCloudflarePullLoop(CANVAS_IMPORT_QUEUE, options.jobConcurrency, options.processJob),
    startCloudflarePullLoop(EXTRACT_RETRY_QUEUE, options.jobConcurrency, options.processJob),
    ...(options.markerDispatch.enabled
      ? [startCloudflarePullLoop(
          MARKER_DISPATCH_QUEUE,
          options.markerDispatch.concurrency,
          options.processJob,
        )]
      : []),
  ];
  let running = true;
  return {
    isRunning: () => running,
    close: async () => {
      running = false;
      for (const loop of loops) loop.stop();
      await Promise.allSettled(loops.map((loop) => loop.done));
    },
  };
}

/**
 * Start every queue consumer for the configured provider. Chat generation is
 * BullMQ-only, matching its producer.
 */
export async function startQueueConsumers(options: ConsumerOptions): Promise<QueueConsumers> {
  return getQueueProvider() === "cloudflare"
    ? startCloudflareConsumers(options)
    : startBullMqConsumers(options);
}
