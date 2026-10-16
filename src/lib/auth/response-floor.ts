const MIN_RESPONSE_MS = 500;
const JITTER_MS = 100;

// known and unknown addresses both wait for the same floor plus jitter, so
// response time can't reveal which accounts exist. send email in after()
// rather than before this, since provider latency can exceed the floor
export async function waitForResponseFloor(startedAt: number): Promise<void> {
  const remaining =
    MIN_RESPONSE_MS + Math.random() * JITTER_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
