// S3-backed settings storage
// Uses the storage provider which handles path prefixing
// NOTE: Legacy note/tree storage migrated to PostgreSQL
import { getStorageProvider } from "@/lib/storage/init";
import { cacheGet, cacheSet, cacheInvalidate, cacheKeys } from "@/lib/cache";
import type { StoredSettings } from "@/lib/notes/types/settings";
import logger from "@/lib/logger";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredSettings(settingsJson: string): StoredSettings {
  const parsed: unknown = JSON.parse(settingsJson);
  if (!isObject(parsed)) return {};

  const { avatarKey, ...settings } = parsed;
  return typeof avatarKey === "string"
    ? { ...settings, avatarKey }
    : settings;
}

export function settingsObjectKey(userId: string): string {
  return `settings/${userId}/settings.json`;
}

/**
 * Get user settings from S3 (cached in Redis for 5 minutes)
 */
export async function getSettingsFromS3(
  userId: string,
): Promise<StoredSettings> {
  try {
    const key = cacheKeys.settings(userId);
    const cached = await cacheGet<StoredSettings>(key);
    if (cached) return cached;

    const storage = getStorageProvider();
    const settingsPath = settingsObjectKey(userId);
    const settingsJson = await storage.getObject(settingsPath);
    if (!settingsJson) {
      return {};
    }
    const settings = parseStoredSettings(settingsJson);
    await cacheSet(key, settings, 300);
    return settings;
  } catch (error) {
    logger.error("settings read failed", { error });
    return {};
  }
}

/**
 * Save user settings to S3 (invalidates cache)
 */
export async function saveSettingsToS3(
  userId: string,
  settings: StoredSettings,
): Promise<void> {
  try {
    const storage = getStorageProvider();
    const settingsPath = settingsObjectKey(userId);
    const settingsContent = JSON.stringify(settings, null, 2);
    await storage.putObject(settingsPath, settingsContent, {
      contentType: "application/json",
    });
    await cacheInvalidate(cacheKeys.settings(userId));
  } catch (error) {
    logger.error("settings save failed", { error });
    throw error;
  }
}
