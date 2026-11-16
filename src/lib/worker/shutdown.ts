// set once the worker has been asked to stop, so in-flight work can tell a
// deploy apart from a real failure
let stopping = false;

export function beginWorkerShutdown(): void {
  stopping = true;
}

export function workerShuttingDown(): boolean {
  return stopping;
}
