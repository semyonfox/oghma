// loops the worker runs on its periodic ticks. They take the unit of work as
// an argument so the loop policy can be tested without a database

/** Stop starting new study jobs once a tick has run this long. */
export const STUDY_DRAIN_BUDGET_MS = 4_000;

/**
 * Process study jobs until the queue is empty, the tick's time budget is
 * spent or the worker starts shutting down. One job per tick capped the whole
 * instance at about 12 jobs a minute, so a first visit that queued dozens of
 * classifications took hours even when every answer was cached. A job that
 * has started always finishes; the budget only stops the next one.
 */
export async function drainStudyJobs(
  processNext: () => Promise<boolean>,
  isStopping: () => boolean,
  budgetMs = STUDY_DRAIN_BUDGET_MS,
  now: () => number = Date.now,
): Promise<number> {
  const deadline = now() + budgetMs;
  let processed = 0;
  while (!isStopping() && now() < deadline) {
    if (!(await processNext())) break;
    processed += 1;
  }
  return processed;
}

/** A daily pass of single bounded batches could fall behind a busy week. */
export const MAX_CHAT_PAYLOAD_PRUNE_BATCHES = 20;

/** Prune expired chat request payloads batch by batch until none are left. */
export async function pruneInBatches(
  pruneBatch: () => Promise<number>,
  maxBatches = MAX_CHAT_PAYLOAD_PRUNE_BATCHES,
): Promise<number> {
  let pruned = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const count = await pruneBatch();
    pruned += count;
    if (count === 0) break;
  }
  return pruned;
}
