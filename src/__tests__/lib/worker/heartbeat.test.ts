import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearWorkerHeartbeat,
  readWorkerHeartbeatAge,
  writeWorkerHeartbeat,
} from "@/lib/worker/heartbeat";

describe("worker heartbeat", () => {
  let directory: string;
  let file: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "worker-heartbeat-"));
    file = path.join(directory, "heartbeat.json");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reports the age of the last heartbeat", async () => {
    await writeWorkerHeartbeat(file, 1_000);
    await expect(readWorkerHeartbeatAge(file, 16_000)).resolves.toBe(15_000);
  });

  it("treats a missing, cleared or corrupt heartbeat as no worker", async () => {
    await expect(readWorkerHeartbeatAge(file)).resolves.toBeNull();

    await writeWorkerHeartbeat(file);
    await clearWorkerHeartbeat(file);
    await expect(readWorkerHeartbeatAge(file)).resolves.toBeNull();

    await writeFile(file, "{\"writtenAt\":");
    await expect(readWorkerHeartbeatAge(file)).resolves.toBeNull();
  });
});
