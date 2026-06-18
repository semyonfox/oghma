// Storage initialization
// Creates and configures the storage provider instance

import { createS3ConfigFromEnv, StoreS3, type S3Config } from './s3';
import { createLogger } from './logger';

const logger = createLogger('store.init');

/**
 * Validates that all required S3 configuration is available
 */
function validateS3Config(): S3Config {
  return createS3ConfigFromEnv();
}

/**
 * Global storage provider instance (singleton pattern)
 */
let storageProvider: StoreS3 | null = null;

/**
 * Get the storage provider instance
 * Initializes on first call with environment configuration
 *
 * @returns Configured storage provider instance
 * @throws Error if required environment variables are missing
 */
export function getStorageProvider(): StoreS3 {
  if (storageProvider) {
    return storageProvider;
  }

  try {
    const config = validateS3Config();
    storageProvider = new StoreS3(config);
    logger.info(`Storage initialized with bucket: ${config.bucket}`);
    return storageProvider;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to initialize storage: ${message}`);
    throw error;
  }
}

/**
 * Reset the storage provider (mainly for testing)
 */
export function resetStorageProvider(): void {
  storageProvider = null;
}
