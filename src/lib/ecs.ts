import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION ?? "eu-west-1",
});

const CLUSTER = process.env.ECS_CLUSTER ?? "oghmanotes";
const SERVICE = process.env.ECS_SERVICE ?? "canvas-import-worker";
const MAX_WORKERS = 5;
// OCR is the bottleneck — matches CANVAS_OCR_CONCURRENCY in import-embedding.js
const FILES_PER_WORKER =
  Number.parseInt(process.env.CANVAS_OCR_CONCURRENCY ?? "2", 10) || 2;

// trigger rebuild: 2026-04-16 - force new deployment after AWS migration
// non-fatal — if IAM isn't wired yet the worker DB poll will catch the job
// fileCount: hint for how many workers to start; defaults to 1
export async function ensureWorkerRunning(fileCount = 1) {
  try {
    const desired = Math.min(
      MAX_WORKERS,
      Math.max(1, Math.ceil(fileCount / FILES_PER_WORKER)),
    );
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: CLUSTER,
        service: SERVICE,
        desiredCount: desired,
      }),
    );
  } catch (err) {
    console.error("ECS scale-up failed:", (err as Error).message);
  }
}
