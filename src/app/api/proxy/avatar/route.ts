import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage/init";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import {
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import logger from "@/lib/logger";
import { auth } from "@/auth";
import { validateSession } from "@/lib/auth";

/** resolve user_id from either Auth.js (OAuth) or custom JWT session */
async function resolveUserId(): Promise<string | number | null> {
  const authJsSession = await auth();
  if (authJsSession?.user?.id) return authJsSession.user.id;

  const jwtUser = await validateSession();
  if (jwtUser?.user_id) return jwtUser.user_id;

  return null;
}

/**
 * Avatar proxy endpoint
 * Fetches user's avatar from S3 without exposing signed URLs to browser
 */
export const GET = withErrorHandler(async (_request: NextRequest) => {
  const userId = await resolveUserId();
  if (!userId) {
    return tracedError("Unauthorized", 401);
  }

  try {
    const settings = await getSettingsFromS3(userId as number);
    const avatarKey: string | undefined = settings.avatarKey;

    if (!avatarKey) {
      return tracedError("Avatar not found", 404);
    }

    const storage = getStorageProvider();
    const exists = await storage.hasObject(avatarKey);
    if (!exists) {
      return tracedError("Avatar not found", 404);
    }

    const stream = await storage.getObject(avatarKey);
    if (!stream) {
      return tracedError("Failed to fetch avatar", 500);
    }

    // Determine MIME type from key extension
    let mimeType = "image/jpeg";
    if (avatarKey.endsWith(".png")) mimeType = "image/png";
    else if (avatarKey.endsWith(".gif")) mimeType = "image/gif";
    else if (avatarKey.endsWith(".webp")) mimeType = "image/webp";
    else if (avatarKey.endsWith(".avif")) mimeType = "image/avif";

    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `inline; filename="avatar"`,
      },
    });
  } catch (error) {
    logger.error("error fetching avatar via proxy", { error });
    return tracedError("Failed to fetch avatar", 500);
  }
});
