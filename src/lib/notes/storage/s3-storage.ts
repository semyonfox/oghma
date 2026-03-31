// S3-backed settings storage
// Uses the storage provider which handles path prefixing
// NOTE: Legacy note/tree storage migrated to PostgreSQL
import { getStorageProvider } from "@/lib/storage/init";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";

/**
 * Get user settings from S3 (cached in Redis for 5 minutes)
 */
export async function getSettingsFromS3(
  userId: string | number,
): Promise<Record<string, any>> {
  try {
    const key = cacheKeys.settings(userId);
    const cached = await cacheGet<Record<string, any>>(key);
    if (cached) return cached;

    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsJson = await storage.getObject(settingsPath);
    if (!settingsJson) {
      return {};
    }
    const settings = JSON.parse(settingsJson) as Record<string, any>;
    await cacheSet(key, settings, 300);
    return settings;
  } catch (error) {
    console.error(`Error reading settings for user ${userId} from S3:`, error);
    return {};
  }
}

/**
 * Save user settings to S3 (invalidates cache)
 */
export async function saveSettingsToS3(
  userId: string | number,
  settings: Record<string, any>,
): Promise<void> {
  try {
    const storage = getStorageProvider();
    const settingsPath = `settings/${userId}/settings.json`;
    const settingsContent = JSON.stringify(settings, null, 2);
    await storage.putObject(settingsPath, settingsContent, {
      contentType: "application/json",
    });
    await cacheInvalidate(cacheKeys.settings(userId));
  } catch (error) {
    console.error(`Error saving settings for user ${userId} to S3:`, error);
    throw error;
  }
}
