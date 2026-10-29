import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  parseJsonObject,
  withErrorHandler,
  requireAuth,
} from "@/lib/api-error";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/notes/types/settings";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";
import { getLlmModel } from "@/lib/ai-config";
import { normalizeEditorSize } from "@/lib/notes/editor-width";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/locales";
import { treeViewSettingsSchema } from "@/lib/notes/tree-view-settings";

// settings live in one S3 JSON object and feed cookies and the theme script,
// so only typed values for known keys are stored. unknown keys are ignored
const settingsUpdateSchema = z
  .object({
    sidebar_is_fold: z.boolean(),
    split_sizes: z.tuple([z.number().finite(), z.number().finite()]),
    theme: z.enum(["light", "dark", "system"]),
    daily_root_id: z.string().uuid(),
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    timezone: z.string().max(64),
    ai_canvas_access: z.boolean(),
    tree_view: treeViewSettingsSchema.partial(),
    tree_view_hint_seen: z.boolean(),
    // normalized below: unsupported values fall back instead of failing the save
    editorsize: z.unknown(),
    locale: z.unknown(),
  })
  .partial();

const PREFERENCE_COOKIE = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
} as const;

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
    const theme = settingsUpdateSchema.shape.theme.safeParse(mergedSettings.theme);
    if (theme.success && theme.data) {
      response.cookies.set("ogma-theme", theme.data, PREFERENCE_COOKIE);
    }
    const locale = normalizeLocale(mergedSettings.locale);
    if (locale) {
      response.cookies.set(LOCALE_COOKIE_NAME, locale, PREFERENCE_COOKIE);
    }
    return response;
});

export const POST = withErrorHandler(async (request) => {
    const user = await requireAuth();

    const parsed = settingsUpdateSchema.safeParse(
      await parseJsonObject(request, 16 * 1024),
    );
    if (!parsed.success) throw new ApiError(400, "Invalid settings");
    const { editorsize, locale, ...typed } = parsed.data;

    const sanitized: Partial<Settings> = { ...typed };
    if (editorsize !== undefined) sanitized.editorsize = normalizeEditorSize(editorsize);
    const normalizedLocale = normalizeLocale(locale);
    if (normalizedLocale) sanitized.locale = normalizedLocale;

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
    const savedLocale = normalizeLocale(updatedSettings.locale);
    if (savedLocale) {
      response.cookies.set(LOCALE_COOKIE_NAME, savedLocale, PREFERENCE_COOKIE);
    }
    return response;
});
