import { getStorageProvider } from '@/lib/storage/init';

export async function getSettingsFromS3(userId: number): Promise<Record<string, any>> {
  try {
    const storage = getStorageProvider();
    const settingsJson = await storage.getObject(`settings/${userId}/settings.json`);
    if (!settingsJson) return {};
    return JSON.parse(settingsJson) as Record<string, any>;
  } catch {
    return {};
  }
}

export async function saveSettingsToS3(userId: number, settings: Record<string, any>): Promise<void> {
  const storage = getStorageProvider();
  await storage.putObject(
    `settings/${userId}/settings.json`,
    JSON.stringify(settings, null, 2),
    { contentType: 'application/json' }
  );
}

