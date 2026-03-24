// Next.js instrumentation hook — runs once per server process startup
// docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // only runs in the Node.js server runtime, not during build or in the browser
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // load secrets from AWS Secrets Manager before any route handler runs
  // no-op locally (AWS_SECRETS_ID not set), pulls from Secrets Manager in prod
  if (process.env.NODE_ENV === 'production') {
    try {
      const { loadSecrets } = await import('@/lib/secrets');
      await loadSecrets();
    } catch (err) {
      // log but don't crash — app can still start with existing env vars
      console.error('[instrumentation] failed to load secrets:', err);
    }
  }

  // enable X-Ray auto-tracing of all outbound HTTPS calls (Cohere, OpenWebUI, etc.)
  if (process.env.NODE_ENV === 'production') {
    try {
      const AWSXRay = await import('aws-xray-sdk-core');
      const https = await import('https');
      AWSXRay.captureHTTPsGlobal(https as unknown as Parameters<typeof AWSXRay.captureHTTPsGlobal>[0], true);
      AWSXRay.config([AWSXRay.plugins.ECSPlugin]);
    } catch {
      // X-Ray daemon not available — subsegments become no-ops via the xray helper
    }
  }
}
