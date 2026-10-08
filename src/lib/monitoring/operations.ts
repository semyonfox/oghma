import { captureException, startSpan, withIsolationScope } from "@sentry/core";

export type MonitoredOperation =
  | "study.classify"
  | "study.taxonomy"
  | "study.paper"
  | "worker.canvas"
  | "worker.chat";

export function monitorOperation<T>(
  name: MonitoredOperation,
  work: () => Promise<T>,
): Promise<T> {
  return withIsolationScope((scope) => {
    scope.setTag("operation", name);
    return startSpan({ name, op: "queue.process" }, async () => {
      try {
        return await work();
      } catch (error) {
        captureException(error);
        throw error;
      }
    });
  });
}
