import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getStorageProvider } from "@/lib/storage/init";
import { INLINE_IMAGE_TYPES, storedObjectHeaders } from "@/lib/storage/inline-content";
import { getSettingsFromS3 } from "@/lib/notes/storage/s3-storage";
import { getAuthenticatedUserId } from "@/lib/auth/session";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return new NextResponse(null, { status: 401 });

  const settings = await getSettingsFromS3(userId);
  const { avatarKey } = settings;
  if (!avatarKey) return new NextResponse(null, { status: 404 });

  const storage = getStorageProvider();
  if (!(await storage.hasObject(avatarKey))) return new NextResponse(null, { status: 404 });

  const { body, contentType } = await storage.getObjectStream(avatarKey);
  return new NextResponse(Readable.toWeb(body) as ReadableStream, {
    headers: {
      // the stored type came from magic bytes, but never render anything but a raster image
      ...storedObjectHeaders(contentType ?? "image/jpeg", INLINE_IMAGE_TYPES),
      "Cache-Control": "private, max-age=300",
    },
  });
}
