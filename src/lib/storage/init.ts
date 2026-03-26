// Storage initialization
// Creates and configures the storage provider instance

import { StoreS3, type S3Config } from './s3';
import { createLogger } from './logger';

const logger = createLogger('store.init');

/**
 * Validates that all required S3 configuration is available
 */
function validateS3Config(): S3Config {
  const bucket = process.env.STORAGE_BUCKET;

  if (!bucket) {
    throw new Error(
      'Missing required environment variable: STORAGE_BUCKET. ' +
        'Set it to your S3 bucket name.'
    );
  }

  return {
    bucket,
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    region: process.env.STORAGE_REGION || 'us-east-1',
    endPoint: process.env.STORAGE_ENDPOINT,
    pathStyle: process.env.STORAGE_PATH_STYLE === 'true',
    prefix: process.env.STORAGE_PREFIX || 'oghma',
  };
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
