import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

interface TraceContext {
  traceId: string;
}

const traceStore = new AsyncLocalStorage<TraceContext>();

export function generateTraceId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function getTraceId(): string {
  return traceStore.getStore()?.traceId ?? 'no-trace';
}

export function withTrace<T>(fn: () => Promise<T>): Promise<T> {
  return traceStore.run({ traceId: generateTraceId() }, fn);
}
