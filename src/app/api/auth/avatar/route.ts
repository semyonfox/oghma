// avatar API route - handles profile picture upload and retrieval
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { getStorageProvider } from "@/lib/storage/init";
import {
  getSettingsFromS3,
  saveSettingsToS3,
} from "@/lib/notes/storage/s3-storage";
import logger from "@/lib/logger";
import { assertTrustedOrigin, ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { BodyTooLargeError, readBoundedBody } from "@/lib/http/bounded-body";
import { detectMimeType } from "@/lib/ingestion/detect-mime";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// room for multipart boundaries and headers around the file
const MAX_BODY_BYTES = MAX_BYTES + 64 * 1024;

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getSettingsFromS3(userId);
    const { avatarKey } = settings;

    if (!avatarKey) {
      return NextResponse.json({ avatarUrl: null });
    }

    const storage = getStorageProvider();
    const exists = await storage.hasObject(avatarKey);
    if (!exists) {
      return NextResponse.json({ avatarUrl: null });
    }

    return NextResponse.json({ avatarUrl: "/api/auth/avatar/image" });
  } catch (error) {
    logger.error("error fetching avatar", { error });
    return NextResponse.json(
      { error: "Failed to fetch avatar" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = await checkRateLimit("avatar-upload", String(userId));
    if (limited) return limited;

    // read a bounded body first: request.formData() would buffer any size
    let formData: FormData;
    try {
      const body = await readBoundedBody(request, MAX_BODY_BYTES);
      formData = await new Response(body, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 413 });
      }
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    }
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 5 MB limit" },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // the type comes from the bytes alone; the client-declared type is ignored
    const detectedMime = detectMimeType(buffer, "");
    const ext = detectedMime ? ALLOWED_MIME[detectedMime] : undefined;
    if (!detectedMime || !ext) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPG, PNG, GIF, WebP, or AVIF." },
        { status: 415 },
      );
    }

    const timestamp = Date.now();
    const avatarKey = `avatars/${userId}/${timestamp}.${ext}`;
    const storage = getStorageProvider();
    await storage.putObject(avatarKey, buffer, { contentType: detectedMime });

    // persist key in settings JSON (merge with existing settings)
    const currentSettings = await getSettingsFromS3(userId);
    const { avatarKey: previousAvatarKey } = currentSettings;
    await saveSettingsToS3(userId, { ...currentSettings, avatarKey });

    if (previousAvatarKey && previousAvatarKey !== avatarKey) {
      try {
        await storage.deleteObject(previousAvatarKey);
      } catch (error) {
        logger.warn("failed to delete replaced avatar", { key: previousAvatarKey, error });
      }
    }

    return NextResponse.json({ success: true, avatarUrl: "/api/auth/avatar/image" });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.userMessage }, { status: error.statusCode });
    }
    logger.error("error uploading avatar", { error });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
