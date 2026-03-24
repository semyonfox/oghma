// thin X-Ray subsegment wrapper
// guards against missing daemon / dev environment — always safe to call
// usage:
//   const result = await xraySubsegment('llm-call', async (sub) => {
//     sub?.addAnnotation('model', model)
//     return callLLM(...)
//   })

import type { Subsegment } from 'aws-xray-sdk-core';

type SubsegmentFn<T> = (sub: Subsegment | null) => Promise<T>;

export async function xraySubsegment<T>(name: string, fn: SubsegmentFn<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'production') return fn(null);

  let AWSXRay: typeof import('aws-xray-sdk-core') | null = null;
  try {
    AWSXRay = await import('aws-xray-sdk-core');
  } catch {
    return fn(null);
  }

  let segment;
  try {
    segment = AWSXRay.resolveSegment();
  } catch {
    // active tracing not enabled in this environment (e.g. Amplify compute)
    return fn(null);
  }
  if (!segment) return fn(null);

  const sub = segment.addNewSubsegment(name);
  try {
    const result = await fn(sub as Subsegment);
    sub.close();
    return result;
  } catch (err) {
    sub.addError(err as Error);
    sub.close();
    throw err;
  }
}
