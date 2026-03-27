// Next.js instrumentation hook — runs once per server process startup
// docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // only runs in the Node.js server runtime, not during build or in the browser
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // load secrets from AWS Secrets Manager before any route handler runs
  // no-op locally (SECRETS_ID not set), pulls from Secrets Manager in prod
  // MUST run before validateEnv — secrets provide DATABASE_URL, JWT_SECRET, etc.
  if (process.env.NODE_ENV === "production") {
    try {
      const { loadSecrets } = await import("@/lib/secrets");
      await loadSecrets();
    } catch (err) {
      // log but don't crash — app can still start with existing env vars
      console.error("[instrumentation] failed to load secrets:", err);
    }
  }

  // validate required env vars after secrets are loaded
  const { validateEnv } = await import("@/lib/validateEnv");
  validateEnv();

  // enable X-Ray auto-tracing of all outbound HTTPS calls (Cohere, Kimi, etc.)
  // only when active tracing is enabled (_X_AMZN_TRACE_ID is set by Lambda
  // when active tracing is on — without it captureHTTPsGlobal causes errors)
  if (process.env.NODE_ENV === "production" && process.env._X_AMZN_TRACE_ID) {
    try {
      const { setupXRay } = await import("@/lib/xray");
      setupXRay();
    } catch {
      // X-Ray daemon not available — subsegments become no-ops via the xray helper
    }
  }
}
