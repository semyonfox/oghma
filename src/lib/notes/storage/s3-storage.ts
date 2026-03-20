// S3-backed settings storage
// Uses the storage provider which handles path prefixing
// NOTE: Legacy note/tree storage migrated to PostgreSQL
import { getStorageProvider } from '@/lib/storage/init';

/**
 * Get user settings from S3
 */
export async function getSettingsFromS3(userId: number): Promise<Record<string, any>> {
  try {
    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsJson = await storage.getObject(settingsPath);
    if (!settingsJson) {
      return {}; // Return empty object if no settings exist
    }
    return JSON.parse(settingsJson) as Record<string, any>;
  } catch (error) {
    console.error(`Error reading settings for user ${userId} from S3:`, error);
    return {};
  }
}

/**
 * Save user settings to S3
 */
export async function saveSettingsToS3(userId: number, settings: Record<string, any>): Promise<void> {
  try {
    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsContent = JSON.stringify(settings, null, 2);
    await storage.putObject(settingsPath, settingsContent, { contentType: 'application/json' });
  } catch (error) {
    console.error(`Error saving settings for user ${userId} to S3:`, error);
    throw error;
  }
}

