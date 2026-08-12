/** Create a limiter that runs at most `limit` asynchronous tasks in parallel. */
export function createAsyncLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency limit must be a positive integer");
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (active >= limit || queue.length === 0) return;
    const task = queue.shift();
    if (!task) return;
    active += 1;
    task();
  }

  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

/** Run tasks with bounded concurrency, preserving each input position. */
export async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number) {
  const run = createAsyncLimiter(limit);
  const settled = await Promise.allSettled(tasks.map((task) => run(task)));
  for (const result of settled) {
    if (result.status === "rejected") {
      console.error("[pooled] task rejected:", result.reason);
    }
  }
  return settled;
}
