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
 * Read settings through Redis unless the caller is about to modify storage
 */
export async function getSettingsFromS3(
  userId: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<StoredSettings> {
  const key = cacheKeys.settings(userId);
  if (!fresh) {
    const cached = await cacheGet<StoredSettings>(key);
    if (cached) return cached;
  }

  const settingsJson = await getStorageProvider().getObject(settingsObjectKey(userId));
  if (settingsJson === undefined) return {};

  let settings: StoredSettings;
  try {
    settings = parseStoredSettings(settingsJson);
  } catch (error) {
    // allow a write to repair malformed JSON after a successful storage read
    if (!fresh || !(error instanceof SyntaxError)) throw error;
    logger.warn("invalid stored settings JSON", { error });
    return {};
  }
  if (!fresh) await cacheSet(key, settings, 300);
  return settings;
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
