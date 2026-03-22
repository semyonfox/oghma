import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import winston from 'winston';

interface TraceContext {
  traceId: string;
}

export const traceStore = new AsyncLocalStorage<TraceContext>();

export function generateTraceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function getTraceId(): string {
  return traceStore.getStore()?.traceId ?? 'no-trace';
}

export function withTrace<T>(fn: () => Promise<T>): Promise<T> {
  return traceStore.run({ traceId: generateTraceId() }, fn);
}

// winston format that injects the current trace id into log info
export const traceFormat = winston.format((info) => {
  info.traceId = getTraceId();
  return info;
})();
