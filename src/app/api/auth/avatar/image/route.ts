import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getStorageProvider } from "@/lib/storage/init";
import { ObjectNotFoundError } from "@/lib/storage/base";
import {
  INLINE_IMAGE_TYPES,
  storedObjectHeaders,
} from "@/lib/storage/inline-content";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import logger from "@/lib/logger";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return new NextResponse(null, { status: 401 });

    const { avatarKey } = await getSettingsFromS3(userId);
    if (!avatarKey) return new NextResponse(null, { status: 404 });

    // one round trip: a missing object is a 404, any other storage failure a 500
    const { body, contentType } = await getStorageProvider().getObjectStream(avatarKey);
    return new NextResponse(Readable.toWeb(body) as ReadableStream, {
      headers: {
        // the stored type came from magic bytes, but never render anything but a raster image
        ...storedObjectHeaders(contentType ?? "image/jpeg", INLINE_IMAGE_TYPES),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return new NextResponse(null, { status: 404 });
    logger.error("error serving avatar", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return new NextResponse(null, { status: 500 });
  }
}
