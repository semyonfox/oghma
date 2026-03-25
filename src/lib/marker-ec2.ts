// manages the Marker OCR EC2 instance lifecycle
// starts the instance on demand, waits for the server to be healthy,
// and provides the API URL for the import pipeline
import {
    EC2Client,
    StartInstancesCommand,
    DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';

const ec2 = new EC2Client({ region: process.env.AWS_REGION ?? 'eu-north-1' });
const INSTANCE_ID = process.env.MARKER_EC2_INSTANCE_ID;
const MARKER_URL = process.env.MARKER_API_URL; // http://<elastic-ip>:8000

const HEALTH_CHECK_INTERVAL_MS = 3_000;
const HEALTH_CHECK_TIMEOUT_MS = 180_000; // 3 min — cold start takes ~1-2 min

const MAX_TRANSITION_WAIT_MS = 120_000; // 2 min max wait for pending/stopping

export async function ensureMarkerRunning(): Promise<string> {
    if (!INSTANCE_ID || !MARKER_URL) {
        throw new Error('MARKER_EC2_INSTANCE_ID and MARKER_API_URL must be set');
    }

    const deadline = Date.now() + MAX_TRANSITION_WAIT_MS;

    while (true) {
        const state = await getInstanceState();

        if (state === 'running') {
            await waitForHealthy();
            return MARKER_URL;
        }

        if (state === 'stopped') {
            console.log(`Starting Marker EC2 instance ${INSTANCE_ID}`);
            await ec2.send(new StartInstancesCommand({ InstanceIds: [INSTANCE_ID] }));
            await waitForHealthy();
            return MARKER_URL;
        }

        if (state === 'pending' || state === 'stopping') {
            if (Date.now() > deadline) {
                throw new Error(`Marker instance stuck in ${state} state for over 2 minutes`);
            }
            console.log(`Marker instance in ${state} state, waiting...`);
            await new Promise(r => setTimeout(r, 10_000));
            continue;
        }

        throw new Error(`Marker instance in unexpected state: ${state}`);
    }
}

async function getInstanceState(): Promise<string> {
    const res = await ec2.send(new DescribeInstancesCommand({
        InstanceIds: [INSTANCE_ID!],
    }));
    return res.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? 'unknown';
}

async function waitForHealthy(): Promise<void> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${MARKER_URL}/`, {
                signal: AbortSignal.timeout(5_000),
            });
            if (res.ok) {
                console.log('Marker server is healthy');
                return;
            }
        } catch {
            // server not ready yet
        }
        await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
    }

    throw new Error('Marker server failed to become healthy within timeout');
}
