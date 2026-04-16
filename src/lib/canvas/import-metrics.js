/**
 * Progress, timing, and environment helpers for Canvas imports.
 */

import logger from "../logger.ts";

/**
 * measures and logs the duration of an async phase.
 * logs start/end with duration and metadata to CloudWatch.
 * @param {string} phase - phase name (e.g. "discovery", "extraction", "embedding")
 * @param {string} jobId - job ID for correlation
 * @param {Function} fn - async function to measure
 * @param {object} metadata - additional fields to log
 */
export async function measurePhase(phase, jobId, fn, metadata = {}) {
  const startTime = Date.now();
  try {
    logger.info("canvas-import-phase-start", {
      phase,
      jobId,
      ...metadata,
    });
    const result = await fn();
    const elapsedMs = Date.now() - startTime;
    const elapsedSecs = (elapsedMs / 1000).toFixed(2);
    logger.info("canvas-import-phase-complete", {
      phase,
      jobId,
      elapsedMs,
      elapsedSecs: parseFloat(elapsedSecs),
      ...metadata,
    });
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSecs = (elapsedMs / 1000).toFixed(2);
    logger.error("canvas-import-phase-error", {
      phase,
      jobId,
      error: error.message,
      elapsedMs,
      elapsedSecs: parseFloat(elapsedSecs),
      ...metadata,
    });
    throw error;
  }
}

/**
 * parses a numeric env var with a fallback default.
 * returns defaultValue if the env var is missing, non-numeric, or <= 0.
 */
export function parseEnvConcurrency(name, defaultValue) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}

/**
 * parses a boolean-like env var ("0", "false", "off" are falsy).
 * returns defaultValue when the env var is unset.
 */
export function parseEnvEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}
