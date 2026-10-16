// Storage initialization
// Creates and configures the storage provider instance

import { createS3ConfigFromEnv, StoreS3 } from './s3';

let storageProvider: StoreS3 | null = null;

/**
 * Get the process-wide storage provider, configured from the environment on
 * first use.
 *
 * @throws Error if required environment variables are missing
 */
export function getStorageProvider(): StoreS3 {
  storageProvider ??= new StoreS3(createS3ConfigFromEnv());
  return storageProvider;
}

/**
 * Reset the storage provider (mainly for testing)
 */
export function resetStorageProvider(): void {
  storageProvider = null;
}
