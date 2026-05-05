// Next.js instrumentation hook — runs once per server process startup
// docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/validateEnv");
  validateEnv();
}
