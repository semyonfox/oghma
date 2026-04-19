/**
 * Generic async concurrency utilities.
 * Provides a simple task limiter and a pooled execution helper.
 */

/**
 * creates a concurrency limiter that queues async tasks and runs
 * at most `limit` in parallel at any time.
 * @param {number} limit - max concurrent tasks
 * @returns {(fn: () => Promise<T>) => Promise<T>}
 */
export function createAsyncLimiter(limit) {
  let active = 0;
  const queue = [];

  function next() {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

/**
 * runs an array of task factories with bounded concurrency, returning
 * a Promise.allSettled result array.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} limit - max concurrent tasks
 */
export async function pooled(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p));
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  const settled = await Promise.allSettled(results);
  for (const result of settled) {
    if (result.status === "rejected") {
      console.error("[pooled] task rejected:", result.reason);
    }
  }
  return settled;
}
