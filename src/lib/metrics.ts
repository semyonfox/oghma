// fire-and-forget CloudWatch custom metrics for the OghmaNotesApp namespace
// never throws, never awaited on the hot path — safe to call anywhere

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

const NAMESPACE = 'OghmaNotesApp';
const REGION = process.env.AWS_REGION ?? 'eu-north-1';

let client: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!client) client = new CloudWatchClient({ region: REGION });
  return client;
}

export async function recordMetric(
  name: string,
  value: number,
  unit: StandardUnit,
  dimensions?: Record<string, string>,
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  try {
    await getClient().send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: dimensions
          ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
          : undefined,
      }],
    }));
  } catch {
    // metric loss is acceptable — never let this affect the request
  }
}

export const Metrics = {
  rateLimitViolation: (endpoint: string) =>
    recordMetric('RateLimitViolation', 1, StandardUnit.Count, { Endpoint: endpoint }),

  llmLatency: (ms: number) =>
    recordMetric('LLMCallLatency', ms, StandardUnit.Milliseconds),

  llmError: () =>
    recordMetric('LLMCallError', 1, StandardUnit.Count),

  cohereError: (type: 'embed' | 'rerank') =>
    recordMetric('CohereError', 1, StandardUnit.Count, { Type: type }),

  chatSessionCreated: () =>
    recordMetric('ChatSessionCreated', 1, StandardUnit.Count),
};
