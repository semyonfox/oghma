import winston from "winston";
import "winston-daily-rotate-file";
import { captureException } from "@sentry/core";
import { errorTags } from "./monitoring/privacy";
// operational logs are separate from optional anonymous counters and security audit tables
const LEVELS = ["error", "warn", "info", "debug"] as const;

const SPLAT = Symbol.for("splat");
// names and codes that come from code, never from user content
const SAFE_NAME = /^[a-z][a-z0-9 ._:-]{0,79}$/;
const SAFE_TYPE = /^[A-Z][A-Za-z0-9_]{0,79}$/;
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;
// the logging lint rule keeps messages to fixed strings, this catches anything that slips past it
const SAFE_MESSAGE = /^[A-Za-z][A-Za-z0-9 ,.:;()'/_-]{0,119}$/;
const NAME_FIELDS = ["task", "operation", "stage"] as const;

type LogInfo = winston.Logform.TransformableInfo;

/** the exception passed as `{ error }`, `{ err }` or a positional argument */
function loggedError(info: LogInfo): Error | undefined {
  if (info.error instanceof Error) return info.error;
  if (info.err instanceof Error) return info.err;
  const splat: unknown = info[SPLAT];
  return Array.isArray(splat) ? splat.find((value): value is Error => value instanceof Error) : undefined;
}

function safe(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

/** the fields that may leave the process: fixed names, error classes and codes, timings */
function safeContext(info: LogInfo): Record<string, string | number> {
  const error = loggedError(info);
  const status = typeof info.statusCode === "number" ? info.statusCode : info.status;
  const statusClass = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : undefined;
  const duration = info.durationMs ?? info.elapsedMs;
  const context: Record<string, string | number> = {};
  for (const field of NAME_FIELDS) {
    const value = safe(info[field], SAFE_NAME);
    if (value) context[field] = value;
  }
  if (statusClass) context.statusClass = statusClass;
  if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) context.durationMs = Math.round(duration);
  const errorType = safe(error?.constructor.name, SAFE_TYPE);
  if (errorType) context.errorType = errorType;
  // postgres sqlstates, node/system codes and redis reply prefixes say what failed without saying about whom
  const { errorCode = safe(info.code, SAFE_CODE), redisCommand } = errorTags(error);
  if (errorCode) context.errorCode = errorCode;
  if (redisCommand) context.redisCommand = redisCommand;
  return context;
}

function safeMessage(info: LogInfo): string | undefined {
  if (typeof info.message !== "string") return undefined;
  let message = info.message;
  // winston appends a positional argument's own `message`, from an error or a plain object
  const splat: unknown = info[SPLAT];
  const appended = Array.isArray(splat) ? splat[0] : undefined;
  if (typeof appended === "object" && appended !== null && "message" in appended) {
    // mirrors winston's `if (meta.message)` check and template interpolation
    if (appended.message) {
      const text = String(appended.message);
      if (!message.endsWith(` ${text}`)) return undefined;
      message = message.slice(0, -text.length - 1);
    }
  }
  return safe(message, SAFE_MESSAGE);
}

// capture the stack before the operational log boundary removes error metadata
const reportError = winston.format((info) => {
  if (info.level === "error") {
    const { task, operation, stage, errorCode, redisCommand } = safeContext(info);
    const tags = Object.fromEntries(Object.entries({ task, operation, stage, errorCode, redisCommand, logMessage: safeMessage(info) })
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    captureException(loggedError(info) ?? new Error("Application operation failed"), { tags });
  }
  return info;
})();

export const redactSensitive = winston.format((info) => {
  const level = LEVELS.find((value) => value === info.level) ?? "info";
  const securityEvent = info.category === "duplicate_account_detected" ? "duplicate_account_detected" : null;
  const message = securityEvent
    ?? safeMessage(info)
    ?? (level === "error" ? "operation_failed" : level === "warn" ? "operation_warning" : level === "debug" ? "operation_debug" : "operation_completed");
  return { level, [Symbol.for("level")]: level, message, service: "oghmanotes", ...safeContext(info) };
})();

const isProduction = process.env.NODE_ENV === "production";

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
  }),
];

const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  defaultMeta: { service: "oghmanotes" },
  format: winston.format.combine(
    reportError,
    redactSensitive,
  ),
  transports,
});

if (isProduction) {
  const file = new winston.transports.DailyRotateFile({
    filename: "logs/app-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "100m",
    maxFiles: "14d",
    format: winston.format.json(),
  });
  // nothing listens on the file stream, so a write failing on a full disk
  // (ENOSPC) was an uncaught exception that killed the process. stdout still
  // reaches docker, so drop the file copy and report it once
  file.logStream.on("error", (error) => {
    if (!logger.transports.includes(file)) return;
    logger.remove(file);
    captureException(error, { tags: errorTags(error) });
  });
  logger.add(file);
}

export default logger;
