// no-op stub — homelab does not use AWS X-Ray. Kept so call sites compile
// without churn; if X-Ray is reintroduced, fill in the subsegment logic here.
type SubsegmentFn<T> = (sub: null) => Promise<T>;

export async function xraySubsegment<T>(_name: string, fn: SubsegmentFn<T>): Promise<T> {
  return fn(null);
}
