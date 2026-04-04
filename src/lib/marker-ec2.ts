// manages the Marker OCR server lifecycle
// supports two modes:
//   1. ASG mode (preferred): scales an Auto Scaling Group, ALB handles routing
//   2. Single instance mode (legacy): starts/stops a single EC2 instance
import {
  EC2Client,
  StartInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
} from "@aws-sdk/client-auto-scaling";

// ASG mode (eu-west-1)
const ASG_NAME = process.env.MARKER_ASG_NAME;
const ASG_REGION = process.env.MARKER_ASG_REGION ?? "eu-west-1";

// single instance mode (legacy)
const INSTANCE_ID = process.env.MARKER_EC2_INSTANCE_ID;

// shared
const MARKER_URL = process.env.MARKER_API_URL; // ALB DNS or Elastic IP

const HEALTH_CHECK_INTERVAL_MS = 3_000;
const HEALTH_CHECK_TIMEOUT_MS = 300_000; // 5 min — ASG cold start can take longer
const SINGLE_INSTANCE_TIMEOUT_MS = 180_000; // 3 min for single instance
const MAX_TRANSITION_WAIT_MS = 120_000;

const SCALE_UP_INSTANCES = Math.max(
  1,
  Number.parseInt(process.env.MARKER_SCALE_UP_INSTANCES ?? "1", 10) || 1,
);

const MARKER_READY_CACHE_MS = Math.max(
  0,
  Number.parseInt(process.env.MARKER_READY_CACHE_MS ?? "90000", 10) || 90_000,
);

let lastReadyAt = 0;
let cachedReadyUrl: string | null = null;
let ensureInFlight: Promise<string> | null = null;

export async function ensureMarkerRunning(): Promise<string> {
  if (cachedReadyUrl && Date.now() - lastReadyAt < MARKER_READY_CACHE_MS) {
    return cachedReadyUrl;
  }

  if (ensureInFlight) {
    return ensureInFlight;
  }

  ensureInFlight = (async () => {
    if (!MARKER_URL) {
      throw new Error("MARKER_API_URL must be set");
    }

    // ASG mode: scale up the group, ALB routes traffic
    if (ASG_NAME) {
      const url = await ensureAsgRunning();
      cachedReadyUrl = url;
      lastReadyAt = Date.now();
      return url;
    }

    // single instance mode (legacy)
    if (INSTANCE_ID) {
      const url = await ensureSingleInstanceRunning();
      cachedReadyUrl = url;
      lastReadyAt = Date.now();
      return url;
    }

    throw new Error(
      "Either MARKER_ASG_NAME or MARKER_EC2_INSTANCE_ID must be set",
    );
  })();

  try {
    return await ensureInFlight;
  } finally {
    ensureInFlight = null;
  }
}

// ASG mode: check if instances are running, scale up if needed
async function ensureAsgRunning(): Promise<string> {
  const asg = new AutoScalingClient({ region: ASG_REGION });

  const { AutoScalingGroups } = await asg.send(
    new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: [ASG_NAME!],
    }),
  );

  const group = AutoScalingGroups?.[0];
  if (!group) {
    throw new Error(`ASG ${ASG_NAME} not found in ${ASG_REGION}`);
  }

  const desired = group.DesiredCapacity ?? 0;
  const healthy =
    group.Instances?.filter(
      (i) => i.HealthStatus === "Healthy" && i.LifecycleState === "InService",
    ).length ?? 0;

  console.log(
    `Marker ASG: desired=${desired}, healthy=${healthy}, max=${group.MaxSize}`,
  );

  // if no instances running, scale up
  if (desired === 0) {
    const target = Math.min(
      SCALE_UP_INSTANCES,
      group.MaxSize ?? SCALE_UP_INSTANCES,
    );
    console.log(`Scaling Marker ASG to ${target} instances`);
    await asg.send(
      new SetDesiredCapacityCommand({
        AutoScalingGroupName: ASG_NAME!,
        DesiredCapacity: target,
      }),
    );
  }

  // wait for ALB to have healthy targets
  await waitForHealthy(HEALTH_CHECK_TIMEOUT_MS);
  return MARKER_URL!;
}

// single instance mode (legacy)
async function ensureSingleInstanceRunning(): Promise<string> {
  const ec2 = new EC2Client({ region: process.env.AWS_REGION ?? "eu-north-1" });
  const deadline = Date.now() + MAX_TRANSITION_WAIT_MS;

  while (true) {
    const state = await getInstanceState(ec2);

    if (state === "running") {
      await waitForHealthy(SINGLE_INSTANCE_TIMEOUT_MS);
      return MARKER_URL!;
    }

    if (state === "stopped") {
      console.log(`Starting Marker EC2 instance ${INSTANCE_ID}`);
      await ec2.send(
        new StartInstancesCommand({ InstanceIds: [INSTANCE_ID!] }),
      );
      await waitForHealthy(SINGLE_INSTANCE_TIMEOUT_MS);
      return MARKER_URL!;
    }

    if (state === "pending" || state === "stopping") {
      if (Date.now() > deadline) {
        throw new Error(
          `Marker instance stuck in ${state} state for over 2 minutes`,
        );
      }
      console.log(`Marker instance in ${state} state, waiting...`);
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }

    throw new Error(`Marker instance in unexpected state: ${state}`);
  }
}

async function getInstanceState(ec2: EC2Client): Promise<string> {
  const res = await ec2.send(
    new DescribeInstancesCommand({
      InstanceIds: [INSTANCE_ID!],
    }),
  );
  return res.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? "unknown";
}

async function waitForHealthy(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MARKER_URL}/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        console.log("Marker server is healthy");
        return;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }

  throw new Error("Marker server failed to become healthy within timeout");
}

/**
 * Pre-warms the Marker GPU — call fire-and-forget when we know a user
 * is likely to import notes soon (Canvas connect, new account creation).
 *
 * Triggers ASG scale-up from desired=0 so the instance is warming while
 * the user is still setting up. The ASG scales back to 0 after 15 min idle.
 * Never throws — failures are logged and swallowed.
 */
export function preWarmMarker(): void {
  if (!ASG_NAME && !INSTANCE_ID) return; // marker not configured in this env
  if (cachedReadyUrl && Date.now() - lastReadyAt < MARKER_READY_CACHE_MS)
    return; // already warm

  ensureMarkerRunning().catch((err) => {
    console.warn("Marker pre-warm failed (non-fatal):", err?.message ?? err);
  });
}
