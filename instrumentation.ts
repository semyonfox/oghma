// Next.js instrumentation hook - runs on server startup
// Initialize background tasks and syncing here

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server, not on edge runtime
    const { initAutoSync } = await import('./src/lib/notes/sync/auto-sync');

    // Initialize auto-sync on startup
    try {
      await initAutoSync();
    } catch (error) {
      console.error('Failed to initialize auto-sync:', error);
    }
  }
}
