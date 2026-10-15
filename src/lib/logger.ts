import winston from "winston";
import "winston-daily-rotate-file";
import { captureException } from "@sentry/core";
// operational logs are separate from optional anonymous counters and security audit tables
const LEVELS = ["error", "warn", "info", "debug"] as const;

// capture the stack before the operational log boundary removes error metadata
const reportError = winston.format((info) => {
  if (info.level === "error") {
    const error = info.error instanceof Error
      ? info.error
      : info.err instanceof Error
        ? info.err
        : new Error("Application operation failed");
    captureException(error);
  }
  return info;
})();

export const redactSensitive = winston.format((info) => {
  const level = LEVELS.find((value) => value === info.level) ?? "info";
  const securityEvent = info.category === "duplicate_account_detected" ? "duplicate_account_detected" : null;
  const message = securityEvent ?? (level === "error" ? "operation_failed" : level === "warn" ? "operation_warning" : level === "debug" ? "operation_debug" : "operation_completed");
  const status = typeof info.statusCode === "number" ? info.statusCode : info.status;
  const statusClass = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : undefined;
  return { level, [Symbol.for("level")]: level, message, service: "oghmanotes", ...(statusClass ? { statusClass } : {}) };
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

if (isProduction) {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: "logs/app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "100m",
      maxFiles: "14d",
      format: winston.format.json(),
    }),
  );
}

const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  defaultMeta: { service: "oghmanotes" },
  format: winston.format.combine(
    reportError,
    redactSensitive,
  ),
  transports,
});

export default logger;
