// shared utility functions for the canvas import worker

/**
 * Parse a numeric env var with fallback.
 */
export function parseEnvConcurrency(name, defaultValue) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}

/**
 * Parse a boolean env var (accepts "0", "false", "off" as false).
 */
export function parseEnvEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

/**
 * Promise-based concurrency limiter.
 */
export function createAsyncLimiter(limit) {
  let active = 0;
  const queue = [];

  const next = () => {
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
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

/**
 * Run async tasks with bounded concurrency via Promise.allSettled.
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
  return Promise.allSettled(results);
}

/**
 * MIME type constants and resolver.
 */
export const PROCESSABLE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]);

const EXT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

export function resolveMimeType(filename, canvasMimeType) {
  if (canvasMimeType && PROCESSABLE_TYPES.has(canvasMimeType))
    return canvasMimeType;
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return canvasMimeType;
}
