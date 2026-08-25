import { NextResponse } from "next/server";
import { withErrorHandler, requireAuth } from "@/lib/api-error";
import { DEFAULT_SETTINGS } from "@/lib/notes/types/settings";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";
import { getLlmModel } from "@/lib/ai-config";
import { normalizeEditorSize } from "@/lib/notes/editor-width";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/locales";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const GET = withErrorHandler(async () => {
    const user = await requireAuth();

    // Fetch user's settings from S3
    const userSettings = await getSettingsFromS3(user.user_id);

    // Merge with defaults
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...userSettings,
      ai_model: getLlmModel(),
    };

    const response = NextResponse.json(mergedSettings);
    // mirror the account theme into a cookie so it applies pre-paint on any
    // device once settings have loaded once (read by the theme init script)
    if (mergedSettings.theme) {
      response.cookies.set("ogma-theme", String(mergedSettings.theme), {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    if (mergedSettings.locale) {
      response.cookies.set(LOCALE_COOKIE_NAME, String(mergedSettings.locale), {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return response;
});

export const POST = withErrorHandler(async (request) => {
    const user = await requireAuth();

    const body: unknown = await request.json();

    // only allow known settings keys to prevent arbitrary data injection
    const ALLOWED_KEYS = new Set<string>([
      "sidebar_is_fold",
      "split_sizes",
      "locale",
      "theme",
      "daily_root_id",
      "firstName",
      "lastName",
      "timezone",
      "editorsize",
      "ai_canvas_access",
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of isJsonObject(body) ? Object.entries(body) : []) {
      if (!ALLOWED_KEYS.has(key)) continue;
      if (key === "locale") {
        const locale = normalizeLocale(value);
        if (locale) sanitized.locale = locale;
        continue;
      }
      sanitized[key] =
        key === "editorsize" ? normalizeEditorSize(value) : value;
    }

    // Fetch current settings and merge
    const currentSettings = await getSettingsFromS3(user.user_id);
    const { ai_model: _ignoredAiModel, ...persistedSettings } = currentSettings;
    const updatedSettings = { ...persistedSettings, ...sanitized };

    // Save to S3
    await saveSettingsToS3(user.user_id, updatedSettings);

    const response = NextResponse.json({
      ...updatedSettings,
      ai_model: getLlmModel(),
    });
    if (updatedSettings.locale) {
      response.cookies.set(LOCALE_COOKIE_NAME, String(updatedSettings.locale), {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return response;
});
