import { readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CANVAS_IMPORT_QUEUE } from "@/lib/queue";

// The worker writes this file only while its queue consumers are running.
// The healthcheck runs as a separate process in the same container, so a
// fresh file is the only evidence that the worker itself is alive, its event
// loop is turning and it is still consuming. Redis and PostgreSQL being
// reachable proves neither.
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
export const WORKER_HEARTBEAT_MAX_AGE_MS = 60_000;

export function workerHeartbeatPath(): string {
  return (
    process.env.WORKER_HEARTBEAT_FILE?.trim() ||
    path.join(os.tmpdir(), `${CANVAS_IMPORT_QUEUE}-worker-heartbeat.json`)
  );
}

export async function writeWorkerHeartbeat(
  file = workerHeartbeatPath(),
  now = Date.now(),
): Promise<void> {
  // rename is atomic, so a concurrent healthcheck never reads a partial file
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ pid: process.pid, writtenAt: now }));
  await rename(temporary, file);
}

export async function clearWorkerHeartbeat(file = workerHeartbeatPath()): Promise<void> {
  await rm(file, { force: true });
}

/** Milliseconds since the last heartbeat, or null when none is readable. */
export async function readWorkerHeartbeatAge(
  file = workerHeartbeatPath(),
  now = Date.now(),
): Promise<number | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("writtenAt" in parsed)) {
    return null;
  }
  const { writtenAt } = parsed;
  return typeof writtenAt === "number" && Number.isFinite(writtenAt)
    ? Math.max(0, now - writtenAt)
    : null;
}
