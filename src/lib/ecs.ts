import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

const CLUSTER = process.env.ECS_CLUSTER ?? 'oghmanotes';
const SERVICE = process.env.ECS_SERVICE ?? 'canvas-import-worker';

// non-fatal — if IAM isn't wired yet the worker DB poll will catch the job
export async function ensureWorkerRunning() {
  try {
    await ecsClient.send(new UpdateServiceCommand({
      cluster: CLUSTER,
      service: SERVICE,
      desiredCount: 1,
    }));
  } catch (err) {
    console.error('ECS scale-up failed:', (err as Error).message);
  }
}
