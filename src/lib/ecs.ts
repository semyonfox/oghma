// helper for scaling the ECS import worker up/down from API routes
import { ECSClient, UpdateServiceCommand } from '@aws-sdk/client-ecs';

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION ?? 'eu-north-1',
});

const CLUSTER = process.env.ECS_CLUSTER ?? 'oghmanotes';
const SERVICE = process.env.ECS_SERVICE ?? 'canvas-import-worker';

export async function ensureWorkerRunning() {
  try {
    await ecsClient.send(new UpdateServiceCommand({
      cluster: CLUSTER,
      service: SERVICE,
      desiredCount: 1,
    }));
  } catch (err) {
    // non-fatal — worker might already be running, or IAM role may not have ecs:UpdateService yet
    console.error('ECS scale-up failed (worker may need manual start):', (err as Error).message);
  }
}

export async function scaleWorkerDown() {
  await ecsClient.send(new UpdateServiceCommand({
    cluster: CLUSTER,
    service: SERVICE,
    desiredCount: 0,
  }));
}
