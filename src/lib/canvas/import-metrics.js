/**
 * Environment helpers for Canvas imports.
 */

/**
 * parses a numeric env var with a fallback default.
 * returns defaultValue if the env var is missing, non-numeric, or <= 0.
 */
export function parseEnvConcurrency(name, defaultValue) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
}
