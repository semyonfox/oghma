import winston from "winston";
import "winston-daily-rotate-file";
import CloudWatchTransport from "winston-cloudwatch";
import { traceFormat } from "./trace";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "canvas_token",
  "reset_token",
  "authorization",
  "hashed_password",
  "secret",
  "api_key",
  "apikey",
  "access_key",
  "accesskey",
  "secret_key",
  "secretkey",
  "private_key",
  "session_id",
  "sessionid",
  "cookie",
  "credential",
  "database_url",
]);

function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = typeof value === "object" ? redactObject(value) : value;
    }
  }
  return result;
}

export const redactSensitive = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      info[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      info[key] = redactObject(value);
    }
  }
  return info;
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

  transports.push(
    new CloudWatchTransport({
      logGroupName: "/oghmanotes/app/production",
      logStreamName: `ecs-${process.env.HOSTNAME ?? "unknown"}`,
      awsRegion: process.env.AWS_REGION ?? "eu-north-1",
      jsonMessage: true,
      retentionInDays: 30,
      uploadRate: 2000,
    }),
  );
}

const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  defaultMeta: { service: "oghmanotes" },
  format: winston.format.combine(
    traceFormat,
    redactSensitive,
    winston.format.timestamp(),
  ),
  transports,
});

export default logger;
