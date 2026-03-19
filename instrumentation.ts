// Next.js instrumentation hook - runs on server startup
// Initialize background tasks and syncing here
// NOTE: Auto-sync from S3 no longer needed - all data is in PostgreSQL now

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Background initialization happens here if needed in the future
    // Currently all data operations are handled directly via PostgreSQL
  }
}
